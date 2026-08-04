import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildRelayAuthHeaders, isValidRelayAuth, type RelaySignedPayload } from "../relay-auth";

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

function payload(overrides: Partial<RelaySignedPayload> = {}): RelaySignedPayload {
  return {
    sourceUrl:
      "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/sign/aivideogenerated/x?token=t",
    uploadUrl: "https://open-upload.tiktokapis.com/upload/abc",
    videoSize: 1024,
    chunkSize: 1024,
    totalChunkCount: 1,
    publishId: "pub-1",
    ...overrides,
  };
}

/**
 * POST-REVIEW FIX (CRITICAL 1): this module used to derive a CONSTANT token
 * (HMAC of a fixed string) -- a static bearer secret with no payload binding
 * or expiry, replayable forever with an arbitrary body. These tests target
 * exactly that: a captured (timestamp, signature) pair must be useless for
 * any payload other than the one it was minted for, and useless outside a
 * short window.
 */
describe("relay-auth", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret-value";
  });

  afterEach(() => {
    process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
    vi.useRealTimers();
  });

  it("produces headers that isValidRelayAuth accepts for the same payload", () => {
    const p = payload();
    const headers = buildRelayAuthHeaders(p);
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], headers["x-relay-signature"])).toBe(
      true
    );
  });

  it("never sends NEXTAUTH_SECRET itself on the wire", () => {
    const headers = buildRelayAuthHeaders(payload());
    const wireValues = Object.values(headers).join(" ");
    expect(wireValues).not.toContain(process.env.NEXTAUTH_SECRET as string);
  });

  it("changes when NEXTAUTH_SECRET changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const p = payload();
    const first = buildRelayAuthHeaders(p);
    process.env.NEXTAUTH_SECRET = "a-completely-different-secret";
    const second = buildRelayAuthHeaders(p);
    expect(second["x-relay-signature"]).not.toBe(first["x-relay-signature"]);
  });

  it.each([
    [
      "sourceUrl",
      {
        sourceUrl:
          "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/sign/aivideogenerated/OTHER?token=t",
      },
    ],
    ["uploadUrl", { uploadUrl: "https://attacker.example/sink" }],
    ["videoSize", { videoSize: 999 }],
    ["chunkSize", { chunkSize: 999 }],
    ["totalChunkCount", { totalChunkCount: 2 }],
    ["publishId", { publishId: "pub-attacker-substituted" }],
  ] as const)(
    "rejects a signature minted for the original payload when %s is substituted afterward (proves the whole payload is signed, not just publishId)",
    (_field, override) => {
      const original = payload();
      const headers = buildRelayAuthHeaders(original);
      const tampered = { ...original, ...override };
      expect(
        isValidRelayAuth(tampered, headers["x-relay-timestamp"], headers["x-relay-signature"])
      ).toBe(false);
    }
  );

  it("rejects when the timestamp header is missing", () => {
    const p = payload();
    const headers = buildRelayAuthHeaders(p);
    expect(isValidRelayAuth(p, null, headers["x-relay-signature"])).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    const p = payload();
    const headers = buildRelayAuthHeaders(p);
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], null)).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    const p = payload();
    const headers = buildRelayAuthHeaders(p);
    expect(isValidRelayAuth(p, "not-a-number", headers["x-relay-signature"])).toBe(false);
  });

  it("rejects garbage/wrong-length signature values without throwing", () => {
    const p = payload();
    const headers = buildRelayAuthHeaders(p);
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], "short")).toBe(false);
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], "0".repeat(64))).toBe(false);
  });

  it("accepts a signature still within the 5-minute acceptance window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const p = payload();
    const headers = buildRelayAuthHeaders(p);

    vi.setSystemTime(1_700_000_000_000 + 4 * 60 * 1000); // +4 minutes
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], headers["x-relay-signature"])).toBe(
      true
    );
  });

  it("rejects a signature once it's older than the 5-minute acceptance window (closes the old constant-token's infinite replay window)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const p = payload();
    const headers = buildRelayAuthHeaders(p);

    vi.setSystemTime(1_700_000_000_000 + 6 * 60 * 1000); // +6 minutes
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], headers["x-relay-signature"])).toBe(
      false
    );
  });

  it("tolerates a timestamp a few seconds in the future (clock skew)", () => {
    const p = payload();
    // Mint the signature as-if the dispatching runtime's clock were 10s ahead
    // of the verifying runtime's, then verify at "real" time.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10_000);
    const headers = buildRelayAuthHeaders(p);
    vi.useRealTimers();

    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], headers["x-relay-signature"])).toBe(
      true
    );
  });

  it("rejects a timestamp far enough in the future to be implausible clock skew", () => {
    const p = payload();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000 + 5 * 60 * 1000); // signature minted 5 minutes "ahead"
    const headers = buildRelayAuthHeaders(p);
    vi.setSystemTime(1_700_000_000_000); // verifying "now" is 5 minutes earlier
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], headers["x-relay-signature"])).toBe(
      false
    );
  });

  it("fails closed (throws) when NEXTAUTH_SECRET is not configured at build time", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => buildRelayAuthHeaders(payload())).toThrow();
  });

  it("isValidRelayAuth returns false (not throw) when NEXTAUTH_SECRET is missing at verify time", () => {
    const p = payload();
    const headers = buildRelayAuthHeaders(p);
    delete process.env.NEXTAUTH_SECRET;
    expect(isValidRelayAuth(p, headers["x-relay-timestamp"], headers["x-relay-signature"])).toBe(
      false
    );
  });
});
