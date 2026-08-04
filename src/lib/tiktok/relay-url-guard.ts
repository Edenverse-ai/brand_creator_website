/**
 * Guards the two URLs the background relay function actually touches
 * (netlify/functions/tiktok-publish-background.ts): fetches bytes from
 * `sourceUrl` and PUTs them to `uploadUrl`.
 *
 * POST-REVIEW FIX (CRITICAL 1): the first version of this module was a
 * BLOCKLIST (reject known-private hosts, allow everything else) -- reachable
 * by anyone holding the (previously non-expiring, non-payload-bound) relay
 * token, which combined with "any public https host is fine" made the relay a
 * functioning exfil/amplification proxy: point uploadUrl at an
 * attacker-controlled sink, sourceUrl at any victim URL, and the relay would
 * fetch-and-forward. A reviewer also demonstrated the blocklist itself was
 * incomplete (see public-url-guard.ts's header for the two bypasses).
 *
 * Both destinations the relay legitimately talks to are known and fixed at
 * dispatch time, so this is now a real ALLOWLIST instead:
 *   - uploadUrl is always TikTok-issued (never caller-controlled -- it comes
 *     back from TikTok's own init call, src/lib/tiktok/init.ts) -> must be
 *     under tiktokapis.com.
 *   - sourceUrl for the relay path is a signed URL WE minted against our own
 *     configured Supabase project (src/lib/tiktok/signed-source.ts) -> must be
 *     on that exact host. (A caller-supplied `video_url` is validated
 *     separately and earlier, at the route layer, by public-url-guard.ts's
 *     `assertPublicVideoUrl` -- before any fetch happens, and independent of
 *     whether the relay would later accept it.)
 *
 * This intentionally means the relay only accepts a sourceUrl on OUR OWN
 * storage host -- NOT "video_path only, video_url excluded" (an earlier draft
 * of this comment overstated it that way). In production, video.video_url is
 * itself usually built from this same Supabase project (see
 * backend/app/main/services/ai_video_service.py's `_get_public_url` /
 * `_resolve_video_url`, and src/app/creatorportal/ai-video/data.ts's
 * pass-through), so it passes this check too. What this actually forecloses
 * is relaying from a genuinely THIRD-PARTY host -- which was the exfil
 * primitive CRITICAL 1 closed. See the task report's "Post-review fixes" for
 * the traced data path and the corrected disclosure.
 */

export class UnsafeRelayTargetError extends Error {
  constructor(
    rawUrl: string,
    public readonly kind: "source" | "upload"
  ) {
    super(`Relay ${kind} target not on the allowlist: ${safeHostnameFor(rawUrl)}`);
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

function parseHttpsUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" ? parsed : null;
}

/** TikTok's upload_url is always issued by TikTok's own init response. */
export function assertUploadTargetUrl(rawUrl: string): void {
  const parsed = parseHttpsUrl(rawUrl);
  const host = parsed?.hostname.toLowerCase();
  const allowed =
    host !== undefined && (host === "tiktokapis.com" || host.endsWith(".tiktokapis.com"));
  if (!allowed) {
    throw new UnsafeRelayTargetError(rawUrl, "upload");
  }
}

function configuredSupabaseHost(): string | null {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    return new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The relay's sourceUrl must be our own configured Supabase storage host. */
export function assertSourceTargetUrl(rawUrl: string): void {
  const parsed = parseHttpsUrl(rawUrl);
  const expectedHost = configuredSupabaseHost();
  const allowed =
    parsed !== null && expectedHost !== null && parsed.hostname.toLowerCase() === expectedHost;
  if (!allowed) {
    throw new UnsafeRelayTargetError(rawUrl, "source");
  }
}
