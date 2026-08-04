/**
 * @vitest-environment node
 *
 * The multipart-path test below appends a real File to FormData and round-trips it
 * through Request.formData(). Under the default jsdom environment, jsdom's File/FormData
 * don't survive that round-trip as `instanceof File`, which made the route's file check
 * fail even though the real (Node-runtime) route works correctly. Node env avoids the
 * mismatch, matching the precedent in src/lib/storage/__tests__/signed-upload.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const aiVideoTaskCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { aiVideoTask: { create: (...args: unknown[]) => aiVideoTaskCreate(...args) } },
}));

const deleteFromBucket = vi.fn();
const uploadToBucket = vi.fn();
vi.mock("@/lib/supabase-admin", () => {
  class SupabaseConfigError extends Error {}
  class SupabaseUploadError extends Error {
    path: string;
    constructor(path: string, cause: Error) {
      super(`Supabase upload failed for ${path}: ${cause.message}`);
      this.path = path;
    }
  }
  return {
    SupabaseConfigError,
    SupabaseUploadError,
    deleteFromBucket: (...args: unknown[]) => deleteFromBucket(...args),
    uploadToBucket: (...args: unknown[]) => uploadToBucket(...args),
  };
});

import { getServerSession } from "next-auth";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ai-videos/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNER = "user-1";
const validBody = {
  prompt: "Make a video",
  taskId: "task-abc",
  portrait_path: `${OWNER}/task-abc/portrait.jpg`,
  voice_path: `${OWNER}/task-abc/voice.mp3`,
};

describe("POST /api/ai-videos/tasks (JSON path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(401);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails schema validation (missing taskId)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({ prompt: "hi", portrait_path: `${OWNER}/t/portrait.jpg` }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 400 'Prompt required' when prompt is blank", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(jsonRequest({ ...validBody, prompt: "   " }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Prompt required" });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 400 'Portrait image required' when portrait_path is missing", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({
        prompt: "hi",
        taskId: "task-abc",
        voice_path: `${OWNER}/task-abc/voice.mp3`,
      }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Portrait image required" });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when portrait_path belongs to a different user", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({ ...validBody, portrait_path: "someone-else/task-abc/portrait.jpg" }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when voice_path belongs to a different user (portrait_path valid)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({ ...validBody, voice_path: "someone-else/task-abc/voice.mp3" }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a path-traversal payload that string-prefix-matches the owner (security regression guard)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    // Starts with "user-1/" so a naive startsWith(ownerId + "/") check would incorrectly
    // accept this; it must be rejected by structural validation instead.
    const res = await POST(
      jsonRequest({
        ...validBody,
        portrait_path: `${OWNER}/../someone-else/task-abc/portrait.jpg`,
      }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("creates the AiVideoTask row with field parity to the multipart branch and returns { id, status }", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockResolvedValue({ id: "task-abc", status: "QUEUED" });

    const res = await POST(jsonRequest(validBody) as never);

    expect(aiVideoTaskCreate).toHaveBeenCalledWith({
      data: {
        id: "task-abc",
        creatorId: OWNER,
        prompt: "Make a video",
        portraitPath: `${OWNER}/task-abc/portrait.jpg`,
        voicePath: `${OWNER}/task-abc/voice.mp3`,
      },
      select: { id: true, status: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "task-abc", status: "QUEUED" });
  });

  it("stores voicePath as null when voice_path is omitted", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockResolvedValue({ id: "task-abc", status: "QUEUED" });
    const { voice_path: _voicePath, ...withoutVoice } = validBody;

    await POST(jsonRequest(withoutVoice) as never);

    expect(aiVideoTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voicePath: null }) })
    );
  });

  it("returns 500 and best-effort deletes the uploaded blobs when the DB insert fails", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockRejectedValue(new Error("db down"));

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create task" });
    expect(deleteFromBucket).toHaveBeenCalledWith([
      `${OWNER}/task-abc/portrait.jpg`,
      `${OWNER}/task-abc/voice.mp3`,
    ]);
  });
});

describe("POST /api/ai-videos/tasks (legacy multipart path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still creates a task from multipart form data unchanged", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    uploadToBucket.mockResolvedValue(undefined);
    aiVideoTaskCreate.mockResolvedValue({ id: "task-multipart", status: "QUEUED" });

    const formData = new FormData();
    formData.append("prompt", "hello");
    formData.append(
      "portrait",
      new File(["portrait-bytes"], "portrait.jpg", { type: "image/jpeg" })
    );

    const req = new Request("http://localhost/api/ai-videos/tasks", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as never);

    expect(uploadToBucket).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "task-multipart", status: "QUEUED" });
  });
});
