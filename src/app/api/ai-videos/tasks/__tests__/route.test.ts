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
const aiVideoTaskFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiVideoTask: {
      create: (...args: unknown[]) => aiVideoTaskCreate(...args),
      findUnique: (...args: unknown[]) => aiVideoTaskFindUnique(...args),
    },
  },
}));

const submitTask = vi.fn();
const remainingToday = vi.fn();
vi.mock("@/lib/ai-video-generation", () => ({
  submitTask: (...args: unknown[]) => submitTask(...args),
  remainingToday: (...args: unknown[]) => remainingToday(...args),
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
  taskId: "taskabc",
  portrait_path: `${OWNER}/taskabc/portrait.jpg`,
  voice_path: `${OWNER}/taskabc/voice.mp3`,
};

const DEFAULT_PARAMS = { ratio: "9:16", duration: 5, resolution: "720p", generateAudio: true };

describe("POST /api/ai-videos/tasks (JSON path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remainingToday.mockResolvedValue({ remaining: 5, limit: 5 });
    submitTask.mockResolvedValue(undefined);
    aiVideoTaskFindUnique.mockResolvedValue({
      id: "taskabc",
      status: "GENERATING",
      errorMessage: null,
    });
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(401);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when a reference image is given without its taskId", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({ prompt: "hi", portrait_path: `${OWNER}/t/portrait.jpg` }) as never
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when params contain a value the UI does not offer", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(jsonRequest({ ...validBody, params: { resolution: "1080p" } }) as never);

    expect(res.status).toBe(400);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 429 with remaining 0 when the daily cap is reached", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    remainingToday.mockResolvedValue({ remaining: 0, limit: 5 });

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Daily generation limit reached. Try again tomorrow.",
      remaining: 0,
      limit: 5,
    });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
    expect(submitTask).not.toHaveBeenCalled();
  });

  it("returns 400 when taskId contains characters outside [a-z0-9] (aligned with the minting route's charset)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(jsonRequest({ ...validBody, taskId: "task-abc" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when taskId exceeds the 32-character cap", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(jsonRequest({ ...validBody, taskId: "a".repeat(33) }) as never);

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

  it("creates a text-only task (no reference image) with a server-minted id", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockImplementation(async ({ data }: { data: { id: string } }) => ({
      id: data.id,
      status: "QUEUED",
    }));

    const res = await POST(jsonRequest({ prompt: "a cat" }) as never);

    expect(res.status).toBe(200);
    const data = aiVideoTaskCreate.mock.calls[0][0].data;
    expect(data.id).toMatch(/^[a-z0-9]{20,32}$/);
    expect(data.portraitPath).toBeNull();
    expect(submitTask).toHaveBeenCalledWith(data.id);
  });

  it("returns 403 when portrait_path belongs to a different user", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({ ...validBody, portrait_path: "someone-else/taskabc/portrait.jpg" }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when voice_path belongs to a different user (portrait_path valid)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    const res = await POST(
      jsonRequest({ ...validBody, voice_path: "someone-else/taskabc/voice.mp3" }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when portrait_path's owner segment matches but its task segment does not match the submitted taskId", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    // isOwnedStoragePath alone would accept this (first segment === OWNER); the
    // taskId-segment check is what must reject it, since the path actually belongs
    // to a DIFFERENT task folder this same user owns.
    const res = await POST(
      jsonRequest({ ...validBody, portrait_path: `${OWNER}/some-other-task/portrait.jpg` }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a path-traversal payload whose owner and taskId segments both match (isOwnedStoragePath must be the rejecting layer)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });

    // Both isOwnedTaskPath's checks are individually satisfiable by this path's non-".."
    // segments (segment 0 is the real owner, segment 1 is the real taskId) — only
    // isOwnedStoragePath's OWN ".." segment rejection can reject it. A payload like
    // `${OWNER}/../someone-else/...` would NOT prove this: its second segment ("..")
    // already fails isOwnedTaskPath's taskId-segment check on its own, so that payload
    // would still return 403 even if isOwnedStoragePath's traversal defense were
    // silently removed, masking a regression instead of catching one.
    const res = await POST(
      jsonRequest({
        ...validBody,
        portrait_path: `${OWNER}/${validBody.taskId}/../portrait.jpg`,
      }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("creates the row with params, submits it, and returns the post-submit status", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockResolvedValue({ id: "taskabc", status: "QUEUED" });

    const res = await POST(
      jsonRequest({ ...validBody, params: { ratio: "16:9", duration: 10 } }) as never
    );

    expect(aiVideoTaskCreate).toHaveBeenCalledWith({
      data: {
        id: "taskabc",
        creatorId: OWNER,
        prompt: "Make a video",
        portraitPath: `${OWNER}/taskabc/portrait.jpg`,
        voicePath: `${OWNER}/taskabc/voice.mp3`,
        params: { ...DEFAULT_PARAMS, ratio: "16:9", duration: 10 },
      },
      select: { id: true, status: true },
    });
    expect(submitTask).toHaveBeenCalledWith("taskabc");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "taskabc", status: "GENERATING", errorMessage: null });
  });

  it("returns a FAILED status with its message when submission fails", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockResolvedValue({ id: "taskabc", status: "QUEUED" });
    aiVideoTaskFindUnique.mockResolvedValue({
      id: "taskabc",
      status: "FAILED",
      errorMessage: "Video generation is temporarily unavailable. Please try again later.",
    });

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "FAILED" });
  });

  it("stores voicePath as null when voice_path is omitted", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    aiVideoTaskCreate.mockResolvedValue({ id: "taskabc", status: "QUEUED" });
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
      `${OWNER}/taskabc/portrait.jpg`,
      `${OWNER}/taskabc/voice.mp3`,
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
