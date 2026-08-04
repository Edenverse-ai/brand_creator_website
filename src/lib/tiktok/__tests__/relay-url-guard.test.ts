import { describe, it, expect } from "vitest";
import { assertRelayTargetUrl, UnsafeRelayTargetError } from "../relay-url-guard";

describe("assertRelayTargetUrl", () => {
  it("allows a plain https URL", () => {
    expect(() =>
      assertRelayTargetUrl("https://open-upload.tiktokapis.com/upload/abc")
    ).not.toThrow();
  });

  it("rejects http (non-https)", () => {
    expect(() => assertRelayTargetUrl("http://example.com/x")).toThrow(UnsafeRelayTargetError);
  });

  it("rejects an unparseable URL", () => {
    expect(() => assertRelayTargetUrl("not-a-url")).toThrow(UnsafeRelayTargetError);
  });

  it.each([
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://172.16.0.5/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/x",
    "https://[::1]/x",
    "https://[fe80::1]/x",
  ])("rejects internal/loopback/link-local target %s", (url) => {
    expect(() => assertRelayTargetUrl(url)).toThrow(UnsafeRelayTargetError);
  });

  it("does not false-positive on a public host that merely starts with a blocked octet", () => {
    // e.g. a host beginning with "10" but not the private 10.0.0.0/8 range.
    expect(() => assertRelayTargetUrl("https://10cdn.example.com/x")).not.toThrow();
  });
});
