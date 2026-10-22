/**
 * @vitest-environment node
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
vi.mock("@/lib/supabase-admin", () => ({
  deleteFromBucket: (...args: unknown[]) => deleteFromBucket(...args),
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const OWNER = "user-1";
const TASK = "task1";
const UNLIMITED = "creator-free@test.local";

const validBody = {
  taskId: TASK,
  reference_video_path: `${OWNER}/${TASK}/reference-video.mp4`,
  product_image_paths: [`${OWNER}/${TASK}/product-1.jpg`, `${OWNER}/${TASK}/product-2.png`],
  input: {
    productName: "Ivory Mini Bag",
    targetAudience: "women 25-35",
    sellingPoints: "vegan leather",
    referenceDurationSec: 14.2,
    mode: "seedance2.5",
    resolution: "720p",
    generateAudio: true,
  },
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ai-videos/replicate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signIn(email = "someone@example.com") {
  (getServerSession as any).mockResolvedValue({ user: { id: OWNER, email } });
}

function withInput(input: Record<string, unknown>) {
  return { ...validBody, input: { ...validBody.input, ...input } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_VIDEO_UNLIMITED_EMAILS", UNLIMITED);
  remainingToday.mockResolvedValue({ remaining: 1, limit: 1 });
  aiVideoTaskCreate.mockResolvedValue({ id: TASK });
  submitTask.mockResolvedValue(undefined);
  aiVideoTaskFindUnique.mockResolvedValue({ id: TASK, status: "GENERATING", errorMessage: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ai-videos/replicate", () => {
  it("returns 401 without a session", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await POST(jsonRequest(validBody) as never);
    expect(res.status).toBe(401);
  });

  it("creates a replicate task with the composed prompt and submits it", async () => {
    signIn();

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TASK, status: "GENERATING", errorMessage: null });
    expect(remainingToday).toHaveBeenCalledWith(OWNER, "replicate", 1);
    const { data } = aiVideoTaskCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      id: TASK,
      creatorId: OWNER,
      kind: "replicate",
      referenceVideoPath: validBody.reference_video_path,
      productImagePaths: validBody.product_image_paths,
      replicateInput: {
        productName: "Ivory Mini Bag",
        targetAudience: "women 25-35",
        sellingPoints: "vegan leather",
        referenceDurationSec: 14.2,
      },
      params: {
        mode: "seedance2.5",
        ratio: "adaptive",
        duration: -1,
        resolution: "720p",
        generateAudio: true,
      },
    });
    expect(data.prompt).toMatch(
      /^Video 1 is a trending TikTok video\. Replace the product in Video 1 with "Ivory Mini Bag", the product shown in Image 1 and Image 2/
    );
    // 14.2 s source → a 15 s voiceover budget.
    expect(data.prompt).toContain("Use at most 30 words in total.");
    expect(submitTask).toHaveBeenCalledWith(TASK);
  });

  it.each([
    ["no product images", { ...validBody, product_image_paths: [] }],
    [
      "four product images",
      {
        ...validBody,
        product_image_paths: [1, 2, 3, 3].map((n) => `${OWNER}/${TASK}/product-${n}.jpg`),
      },
    ],
    ["no reference video", { ...validBody, reference_video_path: "" }],
    [
      "a video path that isn't the reference video",
      { ...validBody, reference_video_path: `${OWNER}/${TASK}/portrait.jpg` },
    ],
    [
      "the same product image twice",
      {
        ...validBody,
        product_image_paths: [`${OWNER}/${TASK}/product-1.jpg`, `${OWNER}/${TASK}/product-1.jpg`],
      },
    ],
    ["a missing taskId", { ...validBody, taskId: undefined }],
    ["a source shorter than 2 s", withInput({ referenceDurationSec: 1.5 })],
  ])("returns 400 for %s", async (_label, body) => {
    signIn();
    const res = await POST(jsonRequest(body) as never);
    expect(res.status).toBe(400);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
    expect(submitTask).not.toHaveBeenCalled();
  });

  it("returns 400 'Product name required' for a blank product name", async () => {
    signIn();
    const res = await POST(jsonRequest(withInput({ productName: "   " })) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Product name required" });
  });

  it.each([
    ["another user's folder", `user-2/${TASK}/reference-video.mp4`],
    ["another task's folder", `${OWNER}/other/reference-video.mp4`],
    ["a traversal path", `${OWNER}/${TASK}/../${TASK}/reference-video.mp4`],
  ])("returns 403 for a video in %s", async (_label, path) => {
    signIn();
    const res = await POST(jsonRequest({ ...validBody, reference_video_path: path }) as never);
    expect(res.status).toBe(403);
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("limits free accounts to 15 s sources", async () => {
    signIn();

    const ok = await POST(jsonRequest(withInput({ referenceDurationSec: 15.3 })) as never);
    expect(ok.status).toBe(200);

    const res = await POST(jsonRequest(withInput({ referenceDurationSec: 16 })) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "The original video can be up to 15 seconds. Trim it and try again.",
    });
    expect(aiVideoTaskCreate).toHaveBeenCalledTimes(1);
  });

  it("lets unlimited accounts use 30 s sources on Seedance 2.5, but 15 s on Mini", async () => {
    signIn(UNLIMITED);
    remainingToday.mockResolvedValue({ remaining: null, limit: null });

    const res = await POST(jsonRequest(withInput({ referenceDurationSec: 29.8 })) as never);
    expect(res.status).toBe(200);
    expect(remainingToday).toHaveBeenCalledWith(OWNER, "replicate", null);
    expect(aiVideoTaskCreate.mock.calls[0][0].data.prompt).toContain("at most 60 words");

    const mini = await POST(
      jsonRequest(
        withInput({ referenceDurationSec: 20, mode: "mini", resolution: "1080p" })
      ) as never
    );
    expect(mini.status).toBe(400);
  });

  it("returns 429 once the free replicate of the day is used", async () => {
    signIn();
    remainingToday.mockResolvedValue({ remaining: 0, limit: 1 });

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "You've used today's free trend replicate. Try again tomorrow.",
      remaining: 0,
      limit: 1,
    });
    expect(aiVideoTaskCreate).not.toHaveBeenCalled();
  });

  it("returns 500 and best-effort deletes the uploads when the insert fails", async () => {
    signIn();
    aiVideoTaskCreate.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(500);
    expect(deleteFromBucket).toHaveBeenCalledWith([
      validBody.reference_video_path,
      ...validBody.product_image_paths,
    ]);
    expect(submitTask).not.toHaveBeenCalled();
  });

  it("returns the FAILED status when the provider rejects the task", async () => {
    signIn();
    aiVideoTaskFindUnique.mockResolvedValue({
      id: TASK,
      status: "FAILED",
      errorMessage: "We couldn't start this video.",
    });

    const res = await POST(jsonRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "FAILED" });
  });
});
