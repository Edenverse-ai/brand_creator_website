import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertSourceTargetUrl,
  assertUploadTargetUrl,
  UnsafeRelayTargetError,
} from "../relay-url-guard";

/**
 * POST-REVIEW FIX (CRITICAL 1): this module used to be a BLOCKLIST (reject
 * known-private hosts, allow any other public https host) -- which made the
 * relay a functioning exfil/amplification proxy for anyone holding a valid
 * (previously non-expiring) relay token: point uploadUrl at an
 * attacker-controlled sink, sourceUrl at any victim URL. It's now a real
 * ALLOWLIST: uploadUrl must be tiktokapis.com, sourceUrl must be the
 * configured Supabase host. These tests specifically include the two
 * bypasses a reviewer demonstrated against the old blocklist
 * (`[::ffff:127.0.0.1]`, `metadata.google.internal`) to confirm an allowlist
 * rejects them for a structural reason (not on the allowlist) rather than
 * because a denylist pattern happens to catch them.
 */

const SUPABASE_HOST = "loesykbqlhynbjmqxfxc.supabase.co";
const ORIGINAL_SUPABASE_URL = process.env.SUPABASE_URL;

describe("assertUploadTargetUrl", () => {
  it("allows the bare tiktokapis.com host and subdomains", () => {
    expect(() => assertUploadTargetUrl("https://tiktokapis.com/upload/abc")).not.toThrow();
    expect(() =>
      assertUploadTargetUrl("https://open-upload.tiktokapis.com/upload/abc")
    ).not.toThrow();
  });

  it("allows the .us TLD TikTok actually issues upload_urls on", () => {
    // Regression: a live publish returned open-upload.tiktokapis.us and the
    // .com-only allowlist rejected it at the guard, silently stalling the
    // upload at uploaded_bytes: 0.
    expect(() =>
      assertUploadTargetUrl("https://open-upload.tiktokapis.us/video/?upload_id=abc")
    ).not.toThrow();
    expect(() => assertUploadTargetUrl("https://tiktokapis.us/upload/abc")).not.toThrow();
  });

  it("still rejects lookalikes of the .us domain", () => {
    expect(() => assertUploadTargetUrl("https://tiktokapis.us.attacker.example/x")).toThrow(
      UnsafeRelayTargetError
    );
    expect(() => assertUploadTargetUrl("https://eviltiktokapis.us/x")).toThrow(
      UnsafeRelayTargetError
    );
  });

  it("rejects http (non-https) even on the allowed host", () => {
    expect(() => assertUploadTargetUrl("http://open-upload.tiktokapis.com/upload/abc")).toThrow(
      UnsafeRelayTargetError
    );
  });

  it("rejects an unparseable URL", () => {
    expect(() => assertUploadTargetUrl("not-a-url")).toThrow(UnsafeRelayTargetError);
  });

  it("rejects an attacker-controlled sink", () => {
    expect(() => assertUploadTargetUrl("https://attacker.example/sink")).toThrow(
      UnsafeRelayTargetError
    );
  });

  it("rejects a lookalike host that merely contains tiktokapis.com as a substring, not a suffix", () => {
    expect(() => assertUploadTargetUrl("https://tiktokapis.com.attacker.example/x")).toThrow(
      UnsafeRelayTargetError
    );
  });

  it.each(["https://[::ffff:127.0.0.1]/x", "https://metadata.google.internal/x"])(
    "rejects the demonstrated blocklist-bypass target %s (structurally not on the allowlist)",
    (url) => {
      expect(() => assertUploadTargetUrl(url)).toThrow(UnsafeRelayTargetError);
    }
  );
});

describe("assertSourceTargetUrl", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
  });

  afterEach(() => {
    process.env.SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  });

  it("allows the exact configured Supabase host", () => {
    expect(() =>
      assertSourceTargetUrl(
        `https://${SUPABASE_HOST}/storage/v1/object/sign/aivideogenerated/x?token=t`
      )
    ).not.toThrow();
  });

  it("rejects http (non-https) even on the configured host", () => {
    expect(() =>
      assertSourceTargetUrl(
        `http://${SUPABASE_HOST}/storage/v1/object/sign/aivideogenerated/x?token=t`
      )
    ).toThrow(UnsafeRelayTargetError);
  });

  it("rejects a different Supabase project's host", () => {
    expect(() =>
      assertSourceTargetUrl("https://someotherproject.supabase.co/storage/v1/object/sign/x?token=t")
    ).toThrow(UnsafeRelayTargetError);
  });

  it("rejects a victim/arbitrary public URL, not just obviously-internal ones", () => {
    expect(() => assertSourceTargetUrl("https://victim-cdn.example/private.mp4?sig=abc")).toThrow(
      UnsafeRelayTargetError
    );
  });

  it("rejects an unparseable URL", () => {
    expect(() => assertSourceTargetUrl("not-a-url")).toThrow(UnsafeRelayTargetError);
  });

  it("fails closed when SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL are both unconfigured", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() =>
      assertSourceTargetUrl(
        `https://${SUPABASE_HOST}/storage/v1/object/sign/aivideogenerated/x?token=t`
      )
    ).toThrow(UnsafeRelayTargetError);
  });

  it.each(["https://[::ffff:127.0.0.1]/x", "https://metadata.google.internal/x"])(
    "rejects the demonstrated blocklist-bypass target %s (structurally not the configured host)",
    (url) => {
      expect(() => assertSourceTargetUrl(url)).toThrow(UnsafeRelayTargetError);
    }
  );
});
