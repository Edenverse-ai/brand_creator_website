import { isIPv4, isIPv6 } from "node:net";

/**
 * Guards a caller-supplied `video_url` before OUR OWN SERVER ever makes a
 * network call to it (src/app/api/tiktok/publish/route.ts, before
 * fetchVideoSize). POST-REVIEW FIX (IMPORTANT 4): previously nothing stood
 * between a caller-supplied video_url and fetchVideoSize's HEAD/Range-GET
 * calls, letting an authenticated caller use the differing fixed error
 * messages ("Unable to determine video size" vs. downstream success) as a
 * reachability oracle against internal/private network targets.
 *
 * This is a different check from relay-url-guard.ts's ALLOWLIST: this module
 * evaluates genuinely-arbitrary, legitimate third-party URLs (any public video
 * CDN is a valid video_url), so it can't be reduced to a fixed set of known
 * hosts -- it has to reject the DANGEROUS subset instead. That denylist shape
 * only works if it's actually robust, so unlike the first pass at this
 * problem, IP literals are parsed and numerically evaluated (not
 * string/regex-matched) specifically to survive the two bypasses a reviewer
 * demonstrated against the original version:
 *
 *   - `https://[::ffff:127.0.0.1]/x` -- an IPv4-mapped IPv6 literal. Node's
 *     URL parser normalizes this to the hex-compressed form
 *     `[::ffff:7f00:1]` (verified empirically), which no naive
 *     prefix-matching regex catches. Handled by decoding the embedded IPv4
 *     address from either the dotted or hex-compressed form and evaluating it
 *     with the same numeric range checks as a plain IPv4 literal.
 *   - `https://metadata.google.internal/x` -- a plain DNS hostname (never an
 *     IP literal on the wire) that resolves to the GCP metadata service
 *     (169.254.169.254). No IP-literal check can catch a hostname; this is
 *     handled by an explicit hostname blocklist plus a `.internal` suffix
 *     rule (GCP's own convention for its private DNS zone).
 *
 * Still not exhaustive (no DNS-rebinding protection -- verifying a hostname's
 * safety at request-validation time doesn't guarantee the same hostname
 * resolves to the same address when actually fetched). Proportionate here:
 * this closes the concrete, demonstrated bypass classes for an
 * authenticated-only endpoint, not a general-purpose public URL fetcher.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export class UnsafeVideoUrlError extends Error {
  constructor(rawUrl: string) {
    super(`Unsafe video_url target: ${safeHostnameFor(rawUrl)}`);
    this.name = "UnsafeVideoUrlError";
  }
}

function safeHostnameFor(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "<unparseable>";
  }
}

function isPrivateIPv4Parts(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed -- treat as unsafe rather than risk a false negative
  }
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, incl. cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  return false;
}

function isPrivateIPv4Literal(address: string): boolean {
  return isPrivateIPv4Parts(address.split(".").map(Number));
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal, in
 * either the dotted form ("::ffff:127.0.0.1") or the hex-compressed form
 * Node's URL parser normalizes to ("::ffff:7f00:1").
 */
function extractIPv4MappedAddress(address: string): number[] | null {
  const dotted = /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(address);
  if (dotted) return dotted.slice(1, 5).map(Number);

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
  }
  return null;
}

function isDangerousIPv6Literal(address: string): boolean {
  if (address === "::1") return true; // loopback
  if (/^fe80:/i.test(address)) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(address)) return true; // unique local (fc00::/7)

  const mapped = extractIPv4MappedAddress(address);
  if (mapped) return isPrivateIPv4Parts(mapped);

  return false;
}

function isDangerousHostname(rawHostname: string): boolean {
  // Strip IPv6 brackets ("[::1]" -> "::1") -- URL#hostname keeps them for IPv6.
  const host = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIPv4(host)) return isPrivateIPv4Literal(host);
  if (isIPv6(host)) return isDangerousIPv6Literal(host);

  return BLOCKED_HOSTNAMES.has(host) || host.endsWith(".internal");
}

/** Throws UnsafeVideoUrlError unless rawUrl is a plain https URL to a public host. */
export function assertPublicVideoUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeVideoUrlError(rawUrl);
  }
  if (parsed.protocol !== "https:") {
    throw new UnsafeVideoUrlError(rawUrl);
  }
  if (isDangerousHostname(parsed.hostname)) {
    throw new UnsafeVideoUrlError(rawUrl);
  }
}
