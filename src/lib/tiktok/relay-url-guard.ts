const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

export class UnsafeRelayTargetError extends Error {
  constructor(rawUrl: string) {
    super(`Unsafe relay target: ${safeHostnameFor(rawUrl)}`);
    this.name = "UnsafeRelayTargetError";
  }
}

function safeHostnameFor(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "<unparseable>";
  }
}

/**
 * Defense-in-depth for the background relay function, which fetches bytes from
 * one caller-influenced URL (the signed Supabase source) and PUTs them to
 * another (TikTok's upload_url): reject anything that isn't a plain https URL,
 * or that resolves to an obviously-internal/loopback/link-local hostname. This
 * doesn't replace the x-relay-auth gate (relay-auth.ts) -- it limits blast
 * radius if that gate is ever bypassed or misconfigured.
 *
 * Not exhaustive (no DNS-rebinding protection, no redirect-chain re-validation)
 * -- proportionate for an internal relay authenticated by relay-auth.ts, not a
 * general-purpose public URL fetcher.
 */
export function assertRelayTargetUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeRelayTargetError(rawUrl);
  }
  if (parsed.protocol !== "https:") {
    throw new UnsafeRelayTargetError(rawUrl);
  }
  if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) {
    throw new UnsafeRelayTargetError(rawUrl);
  }
}
