import { createHmac, timingSafeEqual } from "node:crypto";

// Fixed context string, not a secret itself -- just domain-separates this
// derived token from any other HMAC that might someday reuse NEXTAUTH_SECRET.
const RELAY_AUTH_CONTEXT = "tiktok-publish-background-relay";

/**
 * The background relay function (netlify/functions/tiktok-publish-background.ts)
 * fetches from one caller-supplied URL and PUTs to another -- if it were publicly
 * invocable, anyone could point it at arbitrary source/target URLs (SSRF / open
 * relay). It must only accept requests from POST /api/tiktok/publish.
 *
 * Rather than requiring a brand-new secret (which would need a manual owner
 * setup step before the relay path could work at all -- the opposite of "works
 * tonight, no console action needed"), this derives a purpose-specific token
 * from NEXTAUTH_SECRET, which is already required and already configured for
 * this deploy. NEXTAUTH_SECRET itself never goes on the wire; both sides
 * independently derive the same HMAC and only that derived value is sent.
 */
function deriveRelayToken(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET not configured");
  }
  return createHmac("sha256", secret).update(RELAY_AUTH_CONTEXT).digest("hex");
}

/** Value POST /api/tiktok/publish sends as the x-relay-auth header. */
export function buildRelayAuthHeader(): string {
  return deriveRelayToken();
}

/** Constant-time check the background function runs against that header. */
export function isValidRelayAuthHeader(value: string | null): boolean {
  if (!value) return false;
  let expected: string;
  try {
    expected = deriveRelayToken();
  } catch {
    return false;
  }
  const provided = Buffer.from(value);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) return false;
  return timingSafeEqual(provided, wanted);
}
