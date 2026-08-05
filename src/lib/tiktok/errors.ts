import { UnsafeVideoUrlError } from "./public-url-guard";
import { UnsafeRelayTargetError } from "./relay-url-guard";

/**
 * Fixed, caller-safe error messages + typed error classes for the TikTok publish
 * routes and background relay.
 *
 * A prior incident leaked a raw PrismaClientValidationError.message (including
 * the full record) to a caller. Standing rule since: never echo raw
 * exception/upstream-payload text to callers. Log error.name (and, where it
 * exists, an HTTP status as the closest analog to error.code) server-side
 * instead; return one of the fixed TIKTOK_MESSAGES strings to the client.
 */

export const TIKTOK_MESSAGES = {
  missingPrivacyLevel: "Missing privacy_level for TikTok upload",
  missingVideoSource: "Missing video_url or video_path",
  unsafeVideoUrl: "video_url is not allowed",
  // POST-REVIEW FIX: the previous wording ("use video_path instead") was
  // factually wrong -- the constraint isn't about which request field was
  // used, it's about which HOST the source is on (relay-url-guard.ts's
  // assertSourceTargetUrl allowlist: our own configured Supabase project
  // only). In production, video_url is ALSO usually Supabase-hosted (see
  // task-3-report.md's "Post-review fixes" for the traced data path), so
  // this only fires for a genuinely external/third-party source -- telling
  // the caller to "use video_path instead" would have been misleading advice
  // even then, since video_path resolves to the exact same host check.
  sourceNotRelayable:
    "video source must be hosted on this app's own storage; external URLs are not supported for direct upload",
  uploadTargetInvalid: "TikTok returned an unexpected upload destination",
  signFailed: "Failed to sign video URL",
  sizeUnknown: "Unable to determine video size",
  initFailed: "TikTok init failed",
  dispatchFailed: "Failed to start video upload",
  statusFetchFailed: "TikTok publish status fetch failed",
  unexpected: "Unexpected server error",
} as const;

export class TikTokSignError extends Error {
  constructor(cause?: unknown) {
    super("Failed to sign Supabase video URL");
    this.name = "TikTokSignError";
    this.cause = cause;
  }
}

export class TikTokVideoSizeError extends Error {
  constructor() {
    super("Unable to determine source video size");
    this.name = "TikTokVideoSizeError";
  }
}

export class TikTokInitError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super("TikTok init call failed");
    this.name = "TikTokInitError";
  }
}

export class TikTokDispatchError extends Error {
  constructor(cause?: unknown) {
    super("Failed to dispatch the background upload relay");
    this.name = "TikTokDispatchError";
    this.cause = cause;
  }
}

export class TikTokStatusFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super("TikTok publish status fetch failed");
    this.name = "TikTokStatusFetchError";
  }
}

/** Maps a caught error to one of the fixed, caller-safe TIKTOK_MESSAGES strings. */
export function publicMessageFor(error: unknown): string {
  if (error instanceof UnsafeVideoUrlError) return TIKTOK_MESSAGES.unsafeVideoUrl;
  if (error instanceof UnsafeRelayTargetError) {
    // POST-REVIEW FIX: UnsafeRelayTargetError carries kind: "source" | "upload"
    // (relay-url-guard.ts) but this used to collapse both onto the
    // source-flavoured message unconditionally -- harmless while only
    // assertSourceTargetUrl was route-reachable, but wrong the moment
    // assertUploadTargetUrl is ever called route-side too.
    return error.kind === "upload"
      ? TIKTOK_MESSAGES.uploadTargetInvalid
      : TIKTOK_MESSAGES.sourceNotRelayable;
  }
  if (error instanceof TikTokSignError) return TIKTOK_MESSAGES.signFailed;
  if (error instanceof TikTokVideoSizeError) return TIKTOK_MESSAGES.sizeUnknown;
  if (error instanceof TikTokInitError) return TIKTOK_MESSAGES.initFailed;
  if (error instanceof TikTokDispatchError) return TIKTOK_MESSAGES.dispatchFailed;
  if (error instanceof TikTokStatusFetchError) return TIKTOK_MESSAGES.statusFetchFailed;
  return TIKTOK_MESSAGES.unexpected;
}

/**
 * TikTok error bodies are shaped `{ error: { code, message, log_id } }`. `code`
 * and `log_id` are TikTok-generated constants (e.g. "url_ownership_unverified")
 * and carry no caller data, so they are safe to log. `message` can quote the
 * request back -- including a signed video_url whose `?token=` is a bearer
 * capability -- so any URL inside it is stripped before logging.
 */
const URL_IN_TEXT = /https?:\/\/\S+/gi;

function tiktokErrorDetails(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) return {};
  const body = (payload as { error?: unknown }).error;
  if (typeof body !== "object" || body === null) return {};
  const { code, message, log_id: logId } = body as Record<string, unknown>;
  return {
    ...(typeof code === "string" ? { tiktokCode: code } : {}),
    ...(typeof logId === "string" ? { tiktokLogId: logId } : {}),
    ...(typeof message === "string"
      ? { tiktokMessage: message.replace(URL_IN_TEXT, "[url]") }
      : {}),
  };
}

/**
 * Server-log-only detail for a caught error: error.name always, plus an HTTP
 * status when the error carries one, plus TikTok's own error code/log_id/
 * URL-scrubbed message when the error carries an upstream payload. The raw
 * `payload` is still never logged wholesale, and never returned to the caller.
 */
export function logDetailsFor(error: unknown): Record<string, unknown> {
  if (error instanceof TikTokInitError || error instanceof TikTokStatusFetchError) {
    return { name: error.name, status: error.status, ...tiktokErrorDetails(error.payload) };
  }
  if (error instanceof Error) {
    return { name: error.name };
  }
  return { name: "UnknownError" };
}
