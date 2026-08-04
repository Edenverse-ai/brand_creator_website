import type { Context, Config } from "@netlify/functions";
import { runChunkedUpload, type ChunkedUploadJob } from "../../src/lib/tiktok/relay";
import { isValidRelayAuthHeader } from "../../src/lib/tiktok/relay-auth";
import { assertRelayTargetUrl } from "../../src/lib/tiktok/relay-url-guard";

/**
 * Background function (Netlify's `*-background` naming convention: up to a
 * 15-minute execution budget, Netlify responds 202 to the caller as soon as
 * this invocation is scheduled, and this function's return value is ignored).
 *
 * Dispatched by POST /api/tiktok/publish (via src/lib/tiktok/background-dispatch.ts)
 * after TikTok's init call returns an upload_url + publish_id. Performs the
 * actual byte relay -- fetch the signed Supabase video, PUT it to TikTok's
 * upload_url in chunks -- which is why this exists as a background function
 * instead of code inside the route: relaying a large video can take far longer
 * than a normal serverless function's timeout.
 *
 * There is no result channel back to the caller beyond TikTok's own publish
 * status: the client polls POST /api/tiktok/publish-status, which asks TikTok
 * directly. If this function fails before any chunk reaches TikTok, that
 * failure is only visible in this function's own logs (Netlify function logs)
 * and via whatever generic status TikTok reports for an incomplete upload --
 * see the task report's "concerns" section.
 */

function isChunkedUploadJob(value: unknown): value is ChunkedUploadJob & { publishId: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uploadUrl === "string" &&
    typeof v.sourceUrl === "string" &&
    typeof v.videoSize === "number" &&
    typeof v.chunkSize === "number" &&
    typeof v.totalChunkCount === "number" &&
    typeof v.publishId === "string"
  );
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Only POST /api/tiktok/publish may invoke this function -- see relay-auth.ts
  // for why (this function is otherwise an open fetch-from-A-PUT-to-B relay).
  if (!isValidRelayAuthHeader(req.headers.get("x-relay-auth"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload: unknown = await req.json().catch(() => null);
  if (!isChunkedUploadJob(payload)) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    assertRelayTargetUrl(payload.uploadUrl);
    assertRelayTargetUrl(payload.sourceUrl);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    await runChunkedUpload(payload);
  } catch (error) {
    // publishId is safe to log; uploadUrl/sourceUrl deliberately never are
    // (bearer-capability URLs -- see relay.ts).
    console.error("[tiktok-publish-background] upload failed", {
      publishId: payload.publishId,
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }

  // Netlify already responded 202 to the dispatching route when this invocation
  // was scheduled; this response is not observed by anything.
  return new Response("ok", { status: 200 });
};

export const config: Config = {};
