import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRelayAuthHeaders, type RelaySignedPayload } from "@/lib/tiktok/relay-auth";
import handler from "../tiktok-publish-background";

/**
 * POST-REVIEW FIX (IMPORTANT 6): this repo's first hand-written Netlify
 * function had zero test coverage -- vitest's `include` only collected
 * src/** and tests/**, so nothing under netlify/ was ever loaded. Widened in
 * vitest.config.ts; this file exercises the handler directly (it's a plain
 * `(req, context) => Response`), using the REAL relay-auth signing/
 * verification and relay-url-guard allowlist rather than mocking them out --
 * the whole point is proving the auth gate and URL guard are actually wired
 * into the handler, not just that they exist as unit-tested functions
 * elsewhere.
 */

const SUPABASE_HOST = "loesykbqlhynbjmqxfxc.supabase.co";
const VALID_SOURCE_URL = `https://${SUPABASE_HOST}/storage/v1/object/sign/aivideogenerated/x.mp4?token=t`;
const VALID_UPLOAD_URL = "https://open-upload.tiktokapis.com/upload/abc123";

function validPayload(overrides: Partial<RelaySignedPayload> = {}): RelaySignedPayload {
  return {
    sourceUrl: VALID_SOURCE_URL,
    uploadUrl: VALID_UPLOAD_URL,
    videoSize: 1024,
    chunkSize: 1024,
    totalChunkCount: 1,
    publishId: "pub-1",
    ...overrides,
  };
}

function buildRequest(payload: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request("http://localhost/.netlify/functions/tiktok-publish-background", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
}

describe("netlify/functions/tiktok-publish-background", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret";
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 405 for a non-POST request", async () => {
    const res = await handler(buildRequest(null, {}, "GET"), {} as never);
    expect(res.status).toBe(405);
  });

  it("returns 400 for a malformed payload (missing required fields)", async () => {
    const payload = validPayload();
    const headers = buildRelayAuthHeaders(payload);
    const res = await handler(
      buildRequest({ sourceUrl: payload.sourceUrl }, headers as unknown as Record<string, string>),
      {} as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when no auth headers are present (proves the gate is actually invoked)", async () => {
    const res = await handler(buildRequest(validPayload()), {} as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the signature was minted for a DIFFERENT payload (proves binding to the actual body, not just presence of a signature)", async () => {
    const signedFor = validPayload({ publishId: "pub-original" });
    const headers = buildRelayAuthHeaders(signedFor);
    const tamperedBody = validPayload({ publishId: "pub-attacker-substituted" });

    const res = await handler(
      buildRequest(tamperedBody, headers as unknown as Record<string, string>),
      {} as never
    );

    expect(res.status).toBe(401);
  });

  it("returns 401 when the uploadUrl in the body differs from what was signed (proves sourceUrl/uploadUrl are covered by the signature, not just publishId)", async () => {
    const signedFor = validPayload();
    const headers = buildRelayAuthHeaders(signedFor);
    const tamperedBody = validPayload({ uploadUrl: "https://attacker.example/sink" });

    const res = await handler(
      buildRequest(tamperedBody, headers as unknown as Record<string, string>),
      {} as never
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when uploadUrl is validly-signed but not on the tiktokapis.com allowlist (proves the URL guard runs even after auth passes)", async () => {
    const payload = validPayload({ uploadUrl: "https://attacker.example/sink" });
    const headers = buildRelayAuthHeaders(payload);

    const res = await handler(
      buildRequest(payload, headers as unknown as Record<string, string>),
      {} as never
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when sourceUrl is validly-signed but not on the configured Supabase host", async () => {
    const payload = validPayload({ sourceUrl: "https://victim-cdn.example/private.mp4?sig=x" });
    const headers = buildRelayAuthHeaders(payload);

    const res = await handler(
      buildRequest(payload, headers as unknown as Record<string, string>),
      {} as never
    );

    expect(res.status).toBe(400);
  });

  it("runs the relay and returns 200 for a validly-authenticated, allowlisted payload", async () => {
    const payload = validPayload();
    const headers = buildRelayAuthHeaders(payload);

    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      return new Response(new ArrayBuffer(payload.videoSize), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(
      buildRequest(payload, headers as unknown as Record<string, string>),
      {} as never
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 GET + 1 PUT
  });

  it("still returns 200 when the relay itself fails, and logs the failure without leaking sourceUrl/uploadUrl", async () => {
    const payload = validPayload();
    const headers = buildRelayAuthHeaders(payload);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchMock = vi.fn(async () => new Response("server error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(
      buildRequest(payload, headers as unknown as Record<string, string>),
      {} as never
    );

    // Netlify already responded 202 to the dispatcher when this invocation was
    // scheduled -- this handler's own return value is never observed, so it
    // reports 200 regardless of whether the relay succeeded.
    expect(res.status).toBe(200);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = JSON.stringify(errorSpy.mock.calls);
    expect(loggedArgs).toContain("pub-1"); // publishId is safe to log
    expect(loggedArgs).not.toContain(VALID_SOURCE_URL);
    expect(loggedArgs).not.toContain(VALID_UPLOAD_URL);
    expect(loggedArgs).not.toContain("token=t");

    errorSpy.mockRestore();
  });
});
