/**
 * @vitest-environment node
 *
 * Every test stubs global fetch — nothing here can reach the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiOpenPlatformProvider, buildCreateRequest } from "../client";
import {
  ProviderBalanceError,
  ProviderRequestError,
  ProviderSystemError,
  ProviderUnknownOutcomeError,
} from "../errors";

const BASE = "https://video.example.test";
const KEY = "sk-test-SECRET-KEY";

const input = {
  prompt: "a cat running through long grass",
  mode: "seedance2.5" as const,
  params: {
    ratio: "9:16" as const,
    duration: 5 as const,
    resolution: "720p" as const,
    generateAudio: true,
  },
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let provider: AiOpenPlatformProvider;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  provider = new AiOpenPlatformProvider({ baseUrl: BASE, apiKey: KEY });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, init: init as RequestInit, body: JSON.parse(init.body as string) };
}

describe("buildCreateRequest", () => {
  it("targets the create path with the ApiKey header and an explicit mode", () => {
    const req = buildCreateRequest(input, { baseUrl: `${BASE}/`, apiKey: KEY });
    expect(req.url).toBe(`${BASE}/ai-open-platform-api/v1/lz/video/task/create`);
    expect(req.init.method).toBe("POST");
    expect(req.init.headers).toEqual({ "Content-Type": "application/json", ApiKey: KEY });
    expect(JSON.parse(req.init.body as string)).toEqual({
      prompt: input.prompt,
      mode: "seedance2.5",
      resolution: "720p",
      ratio: "9:16",
      duration: 5,
      generate_audio: true,
      watermark: false,
      output_format: "mp4",
      execution_expires_after: 3600,
    });
  });

  it("adds the reference image only when one is given", () => {
    const req = buildCreateRequest(
      { ...input, referenceImageUrl: "https://storage.example.test/signed.png" },
      { baseUrl: BASE, apiKey: KEY }
    );
    expect(JSON.parse(req.init.body as string).images).toEqual([
      { url: "https://storage.example.test/signed.png", role: "reference_image" },
    ]);
  });
});

describe("createTask", () => {
  it("returns task_id and trace_id on HTTP 200 + code 0", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { code: 0, message: "", data: { task_id: "kz-cgt-1" }, trace_id: "tr-1" })
    );
    await expect(provider.createTask(input)).resolves.toEqual({
      taskId: "kz-cgt-1",
      traceId: "tr-1",
    });
    expect(lastCall().url).toBe(`${BASE}/ai-open-platform-api/v1/lz/video/task/create`);
  });

  it("treats HTTP 200 with a non-zero code as a rejected request", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        code: 1001,
        message: 'invalid ratio "x"',
        data: {},
        trace_id: "tr-2",
      })
    );
    const err = await provider.createTask(input).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect(err.traceId).toBe("tr-2");
    expect(err.providerMessage).toBe('invalid ratio "x"');
  });

  it("recognises insufficient balance (HTTP 429 with 40001)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, {
        code: 429,
        reason: "",
        message: "40001 insufficient balance",
        metadata: {},
      })
    );
    await expect(provider.createTask(input)).rejects.toBeInstanceOf(ProviderBalanceError);
  });

  it("treats other 4xx as a definitive rejection", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 401, message: "bad key" }));
    const err = await provider.createTask(input).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderSystemError);
    expect(err.httpStatus).toBe(401);
  });

  it("treats a network failure as an unknown outcome", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(provider.createTask(input)).rejects.toBeInstanceOf(ProviderUnknownOutcomeError);
  });

  it("treats a 5xx as an unknown outcome (the gateway may have forwarded it)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { code: 502, message: "bad gateway" }));
    await expect(provider.createTask(input)).rejects.toBeInstanceOf(ProviderUnknownOutcomeError);
  });

  it("treats an unparseable 200 or a missing task_id as an unknown outcome", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(provider.createTask(input)).rejects.toBeInstanceOf(ProviderUnknownOutcomeError);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { code: 0, data: {}, trace_id: "t" }));
    await expect(provider.createTask(input)).rejects.toBeInstanceOf(ProviderUnknownOutcomeError);
  });

  it("never puts the API key in an error message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { code: 401, message: "bad key" }));
    const err = await provider.createTask(input).catch((e) => e);
    expect(String(err.message)).not.toContain(KEY);
  });
});

describe("getTaskStatus", () => {
  function statusResponse(data: Record<string, unknown>) {
    return jsonResponse(200, { code: 0, message: "", data, trace_id: "tr-s" });
  }

  it("posts the task_id to the status path", async () => {
    fetchMock.mockResolvedValue(statusResponse({ task_id: "kz-1", status: "running" }));
    await provider.getTaskStatus("kz-1");
    const call = lastCall();
    expect(call.url).toBe(`${BASE}/ai-open-platform-api/v1/lz/video/task/status`);
    expect(call.init.method).toBe("POST");
    expect(call.body).toEqual({ task_id: "kz-1" });
  });

  it.each(["pending", "submitted", "running"])("maps %s to in_progress", async (status) => {
    fetchMock.mockResolvedValue(statusResponse({ task_id: "kz-1", status }));
    await expect(provider.getTaskStatus("kz-1")).resolves.toEqual({
      state: "in_progress",
      traceId: "tr-s",
    });
  });

  it("maps succeeded with video, duration and token usage", async () => {
    fetchMock.mockResolvedValue(
      statusResponse({
        task_id: "kz-1",
        status: "succeeded",
        video_url: "https://cdn.example.test/v.mp4",
        duration: 5,
        usage: { completion_tokens: 108900, total_tokens: 108900 },
      })
    );
    await expect(provider.getTaskStatus("kz-1")).resolves.toEqual({
      state: "succeeded",
      videoUrl: "https://cdn.example.test/v.mp4",
      durationSec: 5,
      completionTokens: 108900,
      traceId: "tr-s",
    });
  });

  it("maps failed with the provider error text", async () => {
    fetchMock.mockResolvedValue(
      statusResponse({ task_id: "kz-1", status: "failed", error: "生成失败：输入内容未通过审核" })
    );
    await expect(provider.getTaskStatus("kz-1")).resolves.toEqual({
      state: "failed",
      error: "生成失败：输入内容未通过审核",
      traceId: "tr-s",
    });
  });

  it("treats succeeded without a video_url as still in progress", async () => {
    fetchMock.mockResolvedValue(statusResponse({ task_id: "kz-1", status: "succeeded" }));
    await expect(provider.getTaskStatus("kz-1")).resolves.toMatchObject({ state: "in_progress" });
  });

  it("throws a system error when the lookup itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(provider.getTaskStatus("kz-1")).rejects.toBeInstanceOf(ProviderSystemError);
  });
});
