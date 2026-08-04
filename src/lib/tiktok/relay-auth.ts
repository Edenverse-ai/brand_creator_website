import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The background relay function (netlify/functions/tiktok-publish-background.ts)
 * fetches from one URL and PUTs to another -- if it were publicly invocable, it
 * would be a functioning exfil/amplification proxy. It must only accept
 * requests from POST /api/tiktok/publish, for the exact payload that route
 * dispatched, within a short window of that dispatch.
 *
 * POST-REVIEW FIX (CRITICAL 1): the first version of this module derived a
 * CONSTANT token (HMAC of a fixed context string) -- effectively a static
 * bearer secret. It didn't bind to the request body at all (not sourceUrl, not
 * uploadUrl, no timestamp), so a leaked/observed token could be replayed
 * indefinitely with an ARBITRARY payload, and rotating it meant rotating
 * NEXTAUTH_SECRET (which logs out every user). This version signs the actual
 * dispatch payload plus a timestamp, with a short acceptance window, so a
 * captured token+signature is worthless outside that window and can't be
 * repurposed for a different sourceUrl/uploadUrl pair.
 *
 * Still deliberately derived from NEXTAUTH_SECRET rather than a new required
 * secret (see the original rationale below) -- no extra owner setup step.
 * NEXTAUTH_SECRET itself never goes on the wire; both sides independently
 * derive the same signature from the same secret + payload + timestamp.
 */

const RELAY_AUTH_CONTEXT = "tiktok-publish-background-relay-v2";

// Total window a signature stays valid for after it was minted.
const ACCEPTANCE_WINDOW_MS = 5 * 60 * 1000;
// Small tolerance for clock skew between the dispatching route's runtime and
// the background function's runtime (different Lambda instances) -- without
// this, a signature minted a few hundred ms "in the future" relative to the
// verifier's clock would be rejected outright on any real skew.
const MAX_FUTURE_SKEW_MS = 30 * 1000;

export interface RelaySignedPayload {
  sourceUrl: string;
  uploadUrl: string;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  publishId: string;
}

/**
 * Fixed field order + explicit separators, rather than signing raw JSON text:
 * two semantically-identical JSON encodings of the same object aren't
 * guaranteed to be byte-identical (whitespace, key order), which would make
 * the signature fragile to how the body happens to get serialized. Signing a
 * canonical join of specific, typed fields sidesteps that entirely.
 */
function canonicalize(payload: RelaySignedPayload, timestampMs: number): string {
  return [
    String(timestampMs),
    payload.sourceUrl,
    payload.uploadUrl,
    String(payload.videoSize),
    String(payload.chunkSize),
    String(payload.totalChunkCount),
    payload.publishId,
  ].join("\n");
}

function computeSignature(payload: RelaySignedPayload, timestampMs: number): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET not configured");
  }
  return createHmac("sha256", secret)
    .update(RELAY_AUTH_CONTEXT)
    .update("\0")
    .update(canonicalize(payload, timestampMs))
    .digest("hex");
}

export interface RelayAuthHeaders {
  "x-relay-timestamp": string;
  "x-relay-signature": string;
}

/** Headers POST /api/tiktok/publish attaches when dispatching a relay job. */
export function buildRelayAuthHeaders(payload: RelaySignedPayload): RelayAuthHeaders {
  const timestampMs = Date.now();
  return {
    "x-relay-timestamp": String(timestampMs),
    "x-relay-signature": computeSignature(payload, timestampMs),
  };
}

/**
 * Verifies the signature covers exactly THIS payload and was minted within
 * the acceptance window. The timestamp comparison itself doesn't need to be
 * constant-time (a timestamp isn't secret); the signature comparison does,
 * and is.
 */
export function isValidRelayAuth(
  payload: RelaySignedPayload,
  timestampHeader: string | null,
  signatureHeader: string | null
): boolean {
  if (!timestampHeader || !signatureHeader) return false;

  const timestampMs = Number(timestampHeader);
  if (!Number.isFinite(timestampMs)) return false;

  const age = Date.now() - timestampMs;
  if (age < -MAX_FUTURE_SKEW_MS || age > ACCEPTANCE_WINDOW_MS) return false;

  let expected: string;
  try {
    expected = computeSignature(payload, timestampMs);
  } catch {
    return false;
  }

  const provided = Buffer.from(signatureHeader);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) return false;
  return timingSafeEqual(provided, wanted);
}
