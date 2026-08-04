import "server-only";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { buildRelayAuthHeaders } from "./relay-auth";
import { TikTokDispatchError } from "./errors";

export interface BackgroundUploadJob {
  uploadUrl: string;
  sourceUrl: string;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  publishId: string;
}

// Netlify Dev's default local port, when neither is set (plain `next dev` does
// not run functions at all -- see the task report's "untested against real
// TikTok" section).
const LOCAL_DEV_FALLBACK_BASE_URL = "http://localhost:8888";

const DISPATCH_TIMEOUT_MS = 10_000;

function backgroundFunctionBaseUrl(): string {
  // DEPLOY_PRIME_URL (correct in both production and deploy-preview contexts,
  // matching this repo's existing e2e:preview convention) takes precedence over
  // URL, matching Netlify's own env var docs for site-to-function calls.
  const base = process.env.DEPLOY_PRIME_URL || process.env.URL || LOCAL_DEV_FALLBACK_BASE_URL;
  return base.replace(/\/$/, "");
}

/**
 * Fires the Netlify background function that performs the actual byte relay
 * (fetch the signed Supabase URL, PUT to TikTok's upload_url, chunked). Netlify
 * responds 202 as soon as the function is scheduled, well before the relay
 * itself completes -- see netlify/functions/tiktok-publish-background.ts.
 *
 * The request never carries the TikTok access_token (upload_url is already a
 * pre-authenticated target, matching the Python's _stream_upload, which PUTs
 * without an Authorization header). It does carry the signed source URL, so
 * this call -- like everything else touching it -- must never be logged.
 */
export async function dispatchBackgroundUpload(job: BackgroundUploadJob): Promise<void> {
  let authHeaders: ReturnType<typeof buildRelayAuthHeaders>;
  try {
    // Signs this exact payload + a fresh timestamp (relay-auth.ts) -- not a
    // static token, so it can't be replayed for a different job.
    authHeaders = buildRelayAuthHeaders(job);
  } catch (error) {
    throw new TikTokDispatchError(error);
  }

  const url = `${backgroundFunctionBaseUrl()}/.netlify/functions/tiktok-publish-background`;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(job),
      },
      DISPATCH_TIMEOUT_MS
    );
  } catch (error) {
    throw new TikTokDispatchError(error);
  }

  // Background functions respond 202 as soon as they're scheduled (Netlify
  // docs) -- well before runChunkedUpload actually finishes.
  if (res.status !== 202) {
    throw new TikTokDispatchError(new Error(`unexpected dispatch status ${res.status}`));
  }
}
