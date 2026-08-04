import { describe, it, expect } from "vitest";
import { assertPublicVideoUrl, UnsafeVideoUrlError } from "../public-url-guard";

/**
 * POST-REVIEW FIX (IMPORTANT 4): previously nothing guarded a caller-supplied
 * video_url before the route's own server called fetchVideoSize against it,
 * letting an authenticated caller use the differing fixed error messages as a
 * reachability oracle against internal targets. This module closes that gap.
 * It's a denylist by necessity (arbitrary third-party video CDNs are
 * legitimate video_url values, so it can't be reduced to a fixed host list
 * the way relay-url-guard.ts's allowlist can) -- these tests specifically
 * include the two bypasses a reviewer demonstrated against the FIRST such
 * denylist attempt in this codebase (relay-url-guard.ts's original version)
 * to confirm this one doesn't repeat them.
 */
describe("assertPublicVideoUrl", () => {
  it("allows an ordinary public https URL", () => {
    expect(() => assertPublicVideoUrl("https://cdn.example.com/video.mp4")).not.toThrow();
  });

  it("rejects non-https schemes (ftp, file, javascript)", () => {
    expect(() => assertPublicVideoUrl("http://cdn.example.com/video.mp4")).toThrow(
      UnsafeVideoUrlError
    );
    expect(() => assertPublicVideoUrl("ftp://cdn.example.com/video.mp4")).toThrow(
      UnsafeVideoUrlError
    );
    expect(() => assertPublicVideoUrl("file:///etc/passwd")).toThrow(UnsafeVideoUrlError);
  });

  it("rejects an unparseable URL", () => {
    expect(() => assertPublicVideoUrl("not-a-url")).toThrow(UnsafeVideoUrlError);
  });

  it.each([
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://127.1.2.3/x",
    "https://10.0.0.5/x",
    "https://172.16.0.5/x",
    "https://172.31.255.255/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/x",
    "https://100.64.0.1/x",
    "https://[::1]/x",
    "https://[fe80::1]/x",
    "https://[fc00::1]/x",
    "https://[fd12:3456::1]/x",
  ])("rejects internal/loopback/link-local/CGNAT target %s", (url) => {
    expect(() => assertPublicVideoUrl(url)).toThrow(UnsafeVideoUrlError);
  });

  it("rejects the IPv4-mapped IPv6 bypass in dotted form", () => {
    expect(() => assertPublicVideoUrl("https://[::ffff:127.0.0.1]/x")).toThrow(UnsafeVideoUrlError);
  });

  it("rejects the IPv4-mapped IPv6 bypass in the hex-compressed form the URL parser normalizes to", () => {
    // new URL("https://[::ffff:127.0.0.1]/x").hostname === "[::ffff:7f00:1]"
    // (verified empirically) -- confirms the guard handles what the parser
    // ACTUALLY produces, not just the input's literal spelling.
    expect(() => assertPublicVideoUrl("https://[::ffff:7f00:1]/x")).toThrow(UnsafeVideoUrlError);
  });

  it("rejects the IPv4-mapped-IPv6 metadata-service bypass", () => {
    // 0:0:0:0:0:ffff:169.254.169.254 -> normalizes to [::ffff:a9fe:a9fe]
    expect(() => assertPublicVideoUrl("https://[::ffff:a9fe:a9fe]/x")).toThrow(UnsafeVideoUrlError);
  });

  it("rejects the metadata.google.internal DNS-name bypass (never an IP literal on the wire)", () => {
    expect(() => assertPublicVideoUrl("https://metadata.google.internal/x")).toThrow(
      UnsafeVideoUrlError
    );
  });

  it("rejects other *.internal hostnames by the same convention", () => {
    expect(() => assertPublicVideoUrl("https://metadata.internal/x")).toThrow(UnsafeVideoUrlError);
    expect(() => assertPublicVideoUrl("https://some-service.internal/x")).toThrow(
      UnsafeVideoUrlError
    );
  });

  it("does not false-positive on a public host that merely starts with a blocked-looking octet", () => {
    expect(() => assertPublicVideoUrl("https://10cdn.example.com/x")).not.toThrow();
    expect(() => assertPublicVideoUrl("https://169.254.example.com/x")).not.toThrow();
  });

  it("does not false-positive on a legitimate public IPv6 host", () => {
    // 2606:4700:4700::1111 is Cloudflare's public DNS -- a real, public,
    // routable IPv6 address, included to confirm the guard isn't rejecting
    // IPv6 wholesale.
    expect(() => assertPublicVideoUrl("https://[2606:4700:4700::1111]/x")).not.toThrow();
  });
});
