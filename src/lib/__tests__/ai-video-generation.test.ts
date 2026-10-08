/**
 * @vitest-environment node
 *
 * Lifecycle of an automated generation task: submit (one billable create per
 * task), sync (status polling) and finalize (one copy into the library).
 * Prisma, storage and the provider are all mocked — no network, no tokens.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import {
  CREATOR_MESSAGES,
  ProviderRequestError,
  ProviderUnknownOutcomeError,
} from "@/lib/seedance/errors";
import type { VideoProvider } from "@/lib/seedance/types";

const db = {
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  aiVideoCreate: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiVideoTask: {
      updateMany: (...a: unknown[]) => db.updateMany(...a),
      findUnique: (...a: unknown[]) => db.findUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => db.findUniqueOrThrow(...a),
      update: (...a: unknown[]) => db.update(...a),
      count: (...a: unknown[]) => db.count(...a),
    },
    aiVideo: { create: (...a: unknown[]) => db.aiVideoCreate(...a) },
    $transaction: (...a: unknown[]) => db.transaction(...a),
  },
}));

const storage = { createSignedUrl: vi.fn(), uploadToAiVideoBucket: vi.fn() };
vi.mock("@/lib/supabase-admin-core", () => ({
  createSignedUrl: (...a: unknown[]) => storage.createSignedUrl(...a),
  uploadToAiVideoBucket: (...a: unknown[]) => storage.uploadToAiVideoBucket(...a),
}));

type FakeProvider = {
  name: VideoProvider["name"];
  createTask: Mock;
  getTaskStatus: Mock;
  downloadVideo: Mock;
};

function fakeProvider(name: VideoProvider["name"]): FakeProvider {
  return {
    name,
    createTask: vi.fn(),
    getTaskStatus: vi.fn(),
    downloadVideo: vi.fn(),
  };
}

let liveProvider = fakeProvider("ai-open-platform");
let mock = fakeProvider("mock");
vi.mock("@/lib/seedance", () => ({ getVideoProvider: () => liveProvider }));
vi.mock("@/lib/seedance/mock", () => ({
  get mockProvider() {
    return mock;
  },
}));

import {
  countTodayGenerations,
  finalizeTask,
  remainingToday,
  submitTask,
  syncTask,
} from "../ai-video-generation";

const NOW = new Date("2026-10-05T12:00:00Z");
const params = {
  mode: "mini",
  ratio: "9:16",
  duration: 5,
  resolution: "720p",
  generateAudio: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const fn of [...Object.values(db), ...Object.values(storage)]) fn.mockReset();
  liveProvider = fakeProvider("ai-open-platform");
  mock = fakeProvider("mock");
  db.transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  vi.stubEnv("DEPLOY_PRIME_URL", "");
  vi.stubEnv("URL", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("submitTask", () => {
  beforeEach(() => {
    db.findUniqueOrThrow.mockResolvedValue({
      id: "t1",
      prompt: "a cat",
      portraitPath: null,
      params,
    });
  });

  it("does nothing when another request already claimed the submit", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    await submitTask("t1");
    expect(liveProvider.createTask).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "QUEUED", submitStartedAt: null },
      data: { submitStartedAt: NOW },
    });
  });

  it("creates the provider task once and moves to GENERATING", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    liveProvider.createTask.mockResolvedValue({ taskId: "kz-1", traceId: "tr-1" });

    await submitTask("t1");

    expect(liveProvider.createTask).toHaveBeenCalledTimes(1);
    expect(liveProvider.createTask).toHaveBeenCalledWith({
      prompt: "a cat",
      params,
      referenceImageUrl: null,
    });
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        status: "GENERATING",
        provider: "ai-open-platform",
        providerTaskId: "kz-1",
        traceId: "tr-1",
        lastCheckedAt: NOW,
      },
    });
  });

  it("generates with the model and format saved on the task", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    liveProvider.createTask.mockResolvedValue({ taskId: "kz-1", traceId: null });

    db.findUniqueOrThrow.mockResolvedValue({
      id: "t1",
      prompt: "a cat",
      portraitPath: null,
      params: { ...params, mode: "seedance2.5", duration: 30 },
    });
    await submitTask("t1");
    expect(liveProvider.createTask.mock.calls[0][0].params).toMatchObject({
      mode: "seedance2.5",
      duration: 30,
    });

    db.findUniqueOrThrow.mockResolvedValue({
      id: "t2",
      prompt: "a cat",
      portraitPath: null,
      params: { ...params, mode: "mini", resolution: "1080p" },
    });
    await submitTask("t2");
    expect(liveProvider.createTask.mock.calls[1][0].params).toMatchObject({
      mode: "mini",
      resolution: "1080p",
    });
  });

  it("passes a 6-hour signed URL for the reference image", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUniqueOrThrow.mockResolvedValue({
      id: "t1",
      prompt: "a cat",
      portraitPath: "u1/t1/portrait.png",
      params,
    });
    storage.createSignedUrl.mockResolvedValue("https://storage.example/signed");
    liveProvider.createTask.mockResolvedValue({ taskId: "kz-1", traceId: null });

    await submitTask("t1");

    expect(storage.createSignedUrl).toHaveBeenCalledWith("u1/t1/portrait.png", 6 * 3600);
    expect(liveProvider.createTask.mock.calls[0][0].referenceImageUrl).toBe(
      "https://storage.example/signed"
    );
  });

  it("refuses to submit when the reference image cannot be signed", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUniqueOrThrow.mockResolvedValue({
      id: "t1",
      prompt: "a cat",
      portraitPath: "u1/t1/portrait.png",
      params,
    });
    storage.createSignedUrl.mockResolvedValue(null);

    await submitTask("t1");

    expect(liveProvider.createTask).not.toHaveBeenCalled();
    expect(db.update.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      failureCode: "submit_rejected",
    });
  });

  it("logs why the create call failed, so an unknown outcome can be diagnosed", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    const socketError = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    liveProvider.createTask.mockRejectedValue(
      new ProviderUnknownOutcomeError(new TypeError("fetch failed", { cause: socketError }))
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await submitTask("t1");

    expect(logged).toHaveBeenCalledWith(
      "[ai-video-generation] submit failed",
      expect.objectContaining({
        failureCode: "unknown_outcome",
        cause: "TypeError: fetch failed",
        causeCode: "ENOTFOUND",
      })
    );
    logged.mockRestore();
  });

  it("marks an unknown outcome FAILED/unknown_outcome and never retries", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    liveProvider.createTask.mockRejectedValue(new ProviderUnknownOutcomeError(new Error("x")));

    await submitTask("t1");

    expect(liveProvider.createTask).toHaveBeenCalledTimes(1);
    expect(db.update.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      failureCode: "unknown_outcome",
      errorMessage: CREATOR_MESSAGES.unknownOutcome,
      provider: "ai-open-platform",
    });
  });

  it("marks a rejected request FAILED/submit_rejected with its trace id", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    liveProvider.createTask.mockRejectedValue(new ProviderRequestError(1, "bad ratio", "tr-x"));

    await submitTask("t1");

    expect(db.update.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      failureCode: "submit_rejected",
      errorMessage: CREATOR_MESSAGES.startFailed,
      traceId: "tr-x",
    });
  });
});

describe("syncTask", () => {
  const generating = {
    id: "t1",
    status: "GENERATING",
    provider: "ai-open-platform",
    providerTaskId: "kz-1",
    submitStartedAt: new Date(NOW.getTime() - 60_000),
  };

  it("ignores tasks that are not generating", async () => {
    db.findUnique.mockResolvedValue({ ...generating, status: "DELIVERED" });
    await syncTask("t1");
    expect(liveProvider.getTaskStatus).not.toHaveBeenCalled();
  });

  it("records the check and leaves in-progress tasks alone", async () => {
    db.findUnique.mockResolvedValue(generating);
    liveProvider.getTaskStatus.mockResolvedValue({ state: "in_progress", traceId: "tr" });

    await syncTask("t1");

    expect(db.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { lastCheckedAt: NOW },
    });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("times out a task still in progress after 75 minutes", async () => {
    db.findUnique.mockResolvedValue({
      ...generating,
      submitStartedAt: new Date(NOW.getTime() - 76 * 60_000),
    });
    liveProvider.getTaskStatus.mockResolvedValue({ state: "in_progress", traceId: null });

    await syncTask("t1");

    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "GENERATING" },
      data: {
        status: "FAILED",
        failureCode: "timeout",
        errorMessage: CREATOR_MESSAGES.timedOut,
        lastCheckedAt: NOW,
      },
    });
  });

  it("marks provider failures FAILED/provider_failed", async () => {
    db.findUnique.mockResolvedValue(generating);
    liveProvider.getTaskStatus.mockResolvedValue({
      state: "failed",
      error: "输入内容未通过审核",
      traceId: "tr-f",
    });

    await syncTask("t1");

    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "GENERATING" },
      data: {
        status: "FAILED",
        failureCode: "provider_failed",
        errorMessage: CREATOR_MESSAGES.contentReview,
        traceId: "tr-f",
        lastCheckedAt: NOW,
      },
    });
  });

  it("logs the provider's raw failure reason with its ids, for support", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.findUnique.mockResolvedValue(generating);
    liveProvider.getTaskStatus.mockResolvedValue({
      state: "failed",
      error: "raw provider reason",
      traceId: "tr-f",
    });

    await syncTask("t1");

    expect(errorSpy).toHaveBeenCalledWith("[ai-video-generation] provider reported failure", {
      taskId: "t1",
      providerTaskId: "kz-1",
      traceId: "tr-f",
      providerError: "raw provider reason",
    });
    errorSpy.mockRestore();
  });

  it("swallows status lookup errors (next poll retries)", async () => {
    db.findUnique.mockResolvedValue(generating);
    liveProvider.getTaskStatus.mockRejectedValue(new Error("network"));
    await expect(syncTask("t1")).resolves.toBeUndefined();
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("uses the mock provider for mock tasks regardless of live config", async () => {
    db.findUnique.mockResolvedValue({ ...generating, provider: "mock", providerTaskId: "mock-1" });
    mock.getTaskStatus.mockResolvedValue({ state: "in_progress", traceId: null });
    await syncTask("t1");
    expect(mock.getTaskStatus).toHaveBeenCalledWith("mock-1");
    expect(liveProvider.getTaskStatus).not.toHaveBeenCalled();
  });

  it("finalizes inline off Netlify when the provider reports success", async () => {
    db.findUnique.mockResolvedValue(generating);
    liveProvider.getTaskStatus.mockResolvedValue({
      state: "succeeded",
      videoUrl: "https://cdn/v.mp4",
      durationSec: 5,
      completionTokens: 100,
      traceId: "tr",
    });
    db.updateMany.mockResolvedValue({ count: 0 }); // finalize claim lost: proves it was attempted

    await syncTask("t1");

    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { finalizeStartedAt: NOW } })
    );
  });

  it("dispatches finalize to the background function on Netlify", async () => {
    vi.stubEnv("URL", "https://cricher.ai");
    vi.stubEnv("NEXTAUTH_SECRET", "s");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    db.findUnique.mockResolvedValue(generating);
    liveProvider.getTaskStatus.mockResolvedValue({
      state: "succeeded",
      videoUrl: "https://cdn/v.mp4",
      durationSec: 5,
      completionTokens: 100,
      traceId: "tr",
    });

    await syncTask("t1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cricher.ai/.netlify/functions/ai-video-finalize-background");
    expect(JSON.parse(init.body)).toEqual({ taskId: "t1" });
    expect(init.headers["x-finalize-signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(db.updateMany).not.toHaveBeenCalled(); // no inline finalize
  });

  describe("finalize dispatch target", () => {
    const PREVIEW = "https://deploy-preview-29--cricher-ai.netlify.app";
    const succeeded = {
      state: "succeeded",
      videoUrl: "https://cdn/v.mp4",
      durationSec: 5,
      completionTokens: 100,
      traceId: "tr",
    };
    let fetchMock: Mock;

    beforeEach(() => {
      // Netlify's runtime only exposes URL (always the production site), never
      // DEPLOY_PRIME_URL — the bug this guards against sent preview dispatches
      // to production, where the function may not exist (404).
      vi.stubEnv("URL", "https://cricher.ai");
      vi.stubEnv("SITE_NAME", "cricher-ai");
      vi.stubEnv("NEXTAUTH_SECRET", "s");
      fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
      vi.stubGlobal("fetch", fetchMock);
      db.findUnique.mockResolvedValue(generating);
      liveProvider.getTaskStatus.mockResolvedValue(succeeded);
    });

    it("dispatches to the deploy the request came from, not the production URL", async () => {
      await syncTask("t1", { origin: PREVIEW });
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${PREVIEW}/.netlify/functions/ai-video-finalize-background`
      );
    });

    it("accepts a preview origin when SITE_NAME is not exposed", async () => {
      vi.stubEnv("SITE_NAME", "");
      await syncTask("t1", { origin: PREVIEW });
      expect(fetchMock.mock.calls[0][0]).toContain(PREVIEW);
    });

    it("falls back to the site URL for an origin that is not this site", async () => {
      await syncTask("t1", { origin: "https://evil.example" });
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://cricher.ai/.netlify/functions/ai-video-finalize-background"
      );
    });

    it("rejects another Netlify site's preview host", async () => {
      await syncTask("t1", { origin: "https://deploy-preview-1--other-site.netlify.app" });
      expect(fetchMock.mock.calls[0][0]).toContain("https://cricher.ai/");
    });

    it("still runs inline off Netlify even when an origin is given", async () => {
      vi.stubEnv("URL", "");
      db.updateMany.mockResolvedValue({ count: 0 });
      await syncTask("t1", { origin: "http://localhost:12000" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { finalizeStartedAt: NOW } })
      );
    });
  });
});

describe("finalizeTask", () => {
  const task = {
    id: "t1",
    creatorId: "u1",
    provider: "ai-open-platform",
    providerTaskId: "kz-1",
  };
  const succeeded = {
    state: "succeeded",
    videoUrl: "https://cdn/v.mp4",
    durationSec: 5,
    completionTokens: 1234,
    traceId: "tr-ok",
  };

  it("does nothing when the claim is held by someone else", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    await finalizeTask("t1");
    expect(storage.uploadToAiVideoBucket).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenCalledWith({
      where: {
        id: "t1",
        status: "GENERATING",
        OR: [
          { finalizeStartedAt: null },
          { finalizeStartedAt: { lt: new Date(NOW.getTime() - 20 * 60_000) } },
        ],
      },
      data: { finalizeStartedAt: NOW },
    });
  });

  it("copies the video into the library and delivers the task", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUniqueOrThrow.mockResolvedValue(task);
    liveProvider.getTaskStatus.mockResolvedValue(succeeded);
    const bytes = new ArrayBuffer(8);
    liveProvider.downloadVideo.mockResolvedValue({ bytes, contentType: "video/mp4" });
    db.aiVideoCreate.mockReturnValue("create-op");
    db.update.mockReturnValue("update-op");

    await finalizeTask("t1");

    expect(liveProvider.downloadVideo).toHaveBeenCalledWith("https://cdn/v.mp4");
    expect(storage.uploadToAiVideoBucket).toHaveBeenCalledWith("u1/t1.mp4", bytes, "video/mp4");

    const created = db.aiVideoCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({
      creator_id: "u1",
      generated_time: NOW,
      video: "u1/t1.mp4",
      tag: '["ai-generated"]',
    });
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        status: "DELIVERED",
        aiVideoId: created.id,
        completionTokens: 1234,
        traceId: "tr-ok",
        lastCheckedAt: NOW,
      },
    });
    expect(db.transaction).toHaveBeenCalledWith(["create-op", "update-op"]);
  });

  it("releases the claim when the upload fails so the next sync retries", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUniqueOrThrow.mockResolvedValue(task);
    liveProvider.getTaskStatus.mockResolvedValue(succeeded);
    liveProvider.downloadVideo.mockResolvedValue({
      bytes: new ArrayBuffer(1),
      contentType: "video/mp4",
    });
    storage.uploadToAiVideoBucket.mockRejectedValue(new Error("storage down"));

    await finalizeTask("t1");

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenLastCalledWith({
      where: { id: "t1", status: "GENERATING" },
      data: { finalizeStartedAt: null },
    });
  });
});

describe("daily cap", () => {
  it("counts only tasks that may have used tokens, since UTC midnight", async () => {
    db.count.mockResolvedValue(3);
    await expect(countTodayGenerations("u1")).resolves.toBe(3);
    expect(db.count).toHaveBeenCalledWith({
      where: {
        creatorId: "u1",
        submitStartedAt: { gte: new Date("2026-10-05T00:00:00Z") },
        OR: [
          { status: { in: ["QUEUED", "GENERATING", "IN_REVIEW", "DELIVERED"] } },
          { status: "FAILED", failureCode: "unknown_outcome" },
        ],
      },
    });
  });

  it("remainingToday never goes below zero", async () => {
    vi.stubEnv("AI_VIDEO_DAILY_LIMIT", "2");
    db.count.mockResolvedValue(5);
    await expect(remainingToday("u1")).resolves.toEqual({ remaining: 0, limit: 2 });
    db.count.mockResolvedValue(1);
    await expect(remainingToday("u1")).resolves.toEqual({ remaining: 1, limit: 2 });
  });
});
