import { TIKTOK_CALL_TIMEOUT_MS } from "./constants";

/**
 * fetch() with an AbortController-driven timeout. Used for calls to TikTok's
 * init/status endpoints and for the size-probe HEAD/Range requests, mirroring
 * the Python httpx client's `timeout=30`.
 *
 * NOT used for the background relay's chunk fetch/PUT calls -- those mirror the
 * Python's `httpx.AsyncClient(timeout=None)` for _stream_upload, relying on
 * Netlify's 15-minute background-function ceiling instead of a per-call timeout.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TIKTOK_CALL_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
