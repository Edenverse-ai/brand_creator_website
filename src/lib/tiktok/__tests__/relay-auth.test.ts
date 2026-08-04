import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildRelayAuthHeader, isValidRelayAuthHeader } from "../relay-auth";

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

describe("relay-auth", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret-value";
  });

  afterEach(() => {
    process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
  });

  it("produces a header value that isValidRelayAuthHeader accepts", () => {
    const header = buildRelayAuthHeader();
    expect(typeof header).toBe("string");
    expect(header.length).toBeGreaterThan(0);
    expect(isValidRelayAuthHeader(header)).toBe(true);
  });

  it("never sends NEXTAUTH_SECRET itself on the wire", () => {
    const header = buildRelayAuthHeader();
    expect(header).not.toBe(process.env.NEXTAUTH_SECRET);
    expect(header).not.toContain(process.env.NEXTAUTH_SECRET as string);
  });

  it("is deterministic for a fixed secret (both sides derive the same value independently)", () => {
    expect(buildRelayAuthHeader()).toBe(buildRelayAuthHeader());
  });

  it("changes when NEXTAUTH_SECRET changes", () => {
    const first = buildRelayAuthHeader();
    process.env.NEXTAUTH_SECRET = "a-completely-different-secret";
    expect(buildRelayAuthHeader()).not.toBe(first);
  });

  it("rejects null, empty, and wrong values", () => {
    expect(isValidRelayAuthHeader(null)).toBe(false);
    expect(isValidRelayAuthHeader("")).toBe(false);
    expect(isValidRelayAuthHeader("not-the-right-token")).toBe(false);
  });

  it("rejects a value of a different length than the expected token without throwing", () => {
    expect(isValidRelayAuthHeader("short")).toBe(false);
  });

  it("fails closed (throws) when NEXTAUTH_SECRET is not configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => buildRelayAuthHeader()).toThrow();
  });

  it("isValidRelayAuthHeader returns false (not throw) when NEXTAUTH_SECRET is missing", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(isValidRelayAuthHeader("anything")).toBe(false);
  });
});
