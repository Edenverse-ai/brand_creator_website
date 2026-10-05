import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs the dispatch from syncTask to netlify/functions/ai-video-finalize-background.
 *
 * Same pattern as src/lib/tiktok/relay-auth.ts (HMAC derived from NEXTAUTH_SECRET,
 * bound to the payload plus a timestamp, short acceptance window), with its own
 * context string so a signature for one function is never valid for the other.
 * The payload is only the task id — the function re-reads everything else from
 * the database and the provider — so a replay can at most finalize a task that
 * is already finished, which the finalize claim makes a no-op.
 */

const CONTEXT = "ai-video-finalize-background-v1";
const ACCEPTANCE_WINDOW_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

function computeSignature(taskId: string, timestampMs: number): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not configured");
  return createHmac("sha256", secret)
    .update(CONTEXT)
    .update("\0")
    .update(`${timestampMs}\n${taskId}`)
    .digest("hex");
}

export interface FinalizeAuthHeaders {
  "x-finalize-timestamp": string;
  "x-finalize-signature": string;
}

export function buildFinalizeAuthHeaders(taskId: string): FinalizeAuthHeaders {
  const timestampMs = Date.now();
  return {
    "x-finalize-timestamp": String(timestampMs),
    "x-finalize-signature": computeSignature(taskId, timestampMs),
  };
}

export function isValidFinalizeAuth(
  taskId: string,
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
    expected = computeSignature(taskId, timestampMs);
  } catch {
    return false;
  }

  const provided = Buffer.from(signatureHeader);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
