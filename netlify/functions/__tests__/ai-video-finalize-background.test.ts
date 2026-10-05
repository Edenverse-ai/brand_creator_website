import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFinalizeAuthHeaders } from "@/lib/ai-video-finalize-auth";

const finalizeTask = vi.fn();
vi.mock("@/lib/ai-video-generation", () => ({
  finalizeTask: (...a: unknown[]) => finalizeTask(...a),
}));

import handler from "../ai-video-finalize-background";

/**
 * Uses the REAL finalize signer/verifier: the point is proving the auth gate is
 * wired into the handler, not that the HMAC helper works in isolation.
 */

function request(payload: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request("http://localhost/.netlify/functions/ai-video-finalize-background", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  finalizeTask.mockReset();
  finalizeTask.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("netlify/functions/ai-video-finalize-background", () => {
  it("returns 405 for a non-POST request", async () => {
    const res = await handler(request(null, {}, "GET"), {} as never);
    expect(res.status).toBe(405);
  });

  it("returns 400 for a malformed payload", async () => {
    const res = await handler(
      request({ taskId: "../etc" }, { ...buildFinalizeAuthHeaders("../etc") }),
      {} as never
    );
    expect(res.status).toBe(400);
    expect(finalizeTask).not.toHaveBeenCalled();
  });

  it("returns 401 without a valid signature", async () => {
    const res = await handler(request({ taskId: "task1" }), {} as never);
    expect(res.status).toBe(401);
    expect(finalizeTask).not.toHaveBeenCalled();
  });

  it("returns 401 for a signature minted for another task", async () => {
    const res = await handler(
      request({ taskId: "task1" }, { ...buildFinalizeAuthHeaders("task2") }),
      {} as never
    );
    expect(res.status).toBe(401);
    expect(finalizeTask).not.toHaveBeenCalled();
  });

  it("finalizes the task for a correctly signed request", async () => {
    const res = await handler(
      request({ taskId: "task1" }, { ...buildFinalizeAuthHeaders("task1") }),
      {} as never
    );
    expect(res.status).toBe(200);
    expect(finalizeTask).toHaveBeenCalledWith("task1");
  });

  it("logs a finalize error by name only", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    finalizeTask.mockRejectedValue(new Error("https://secret.example/?token=abc"));

    const res = await handler(
      request({ taskId: "task1" }, { ...buildFinalizeAuthHeaders("task1") }),
      {} as never
    );

    expect(res.status).toBe(200);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("token=abc");
    errorSpy.mockRestore();
  });
});
