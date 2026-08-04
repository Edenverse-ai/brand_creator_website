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
  if (error instanceof TikTokSignError) return TIKTOK_MESSAGES.signFailed;
  if (error instanceof TikTokVideoSizeError) return TIKTOK_MESSAGES.sizeUnknown;
  if (error instanceof TikTokInitError) return TIKTOK_MESSAGES.initFailed;
  if (error instanceof TikTokDispatchError) return TIKTOK_MESSAGES.dispatchFailed;
  if (error instanceof TikTokStatusFetchError) return TIKTOK_MESSAGES.statusFetchFailed;
  return TIKTOK_MESSAGES.unexpected;
}

/**
 * Server-log-only detail for a caught error: error.name always, plus an HTTP
 * status when the error carries one. Deliberately excludes `payload` on
 * TikTokInitError/TikTokStatusFetchError -- TikTok's upstream error body is
 * itself an echo of caller-supplied request data and must not be logged
 * verbatim any more than it may be returned to the caller.
 */
export function logDetailsFor(error: unknown): Record<string, unknown> {
  if (error instanceof TikTokInitError || error instanceof TikTokStatusFetchError) {
    return { name: error.name, status: error.status };
  }
  if (error instanceof Error) {
    return { name: error.name };
  }
  return { name: "UnknownError" };
}
