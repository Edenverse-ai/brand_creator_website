interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Simple in-memory rate limiter
export class RateLimiter {
  private cache: Map<string, RateLimitEntry>;
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60 * 60 * 1000, maxRequests: number = 5) {
    this.cache = new Map();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up expired entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000).unref();
  }

  // Check if a key is rate limited
  isRateLimited(key: string): boolean {
    if (process.env.E2E_BYPASS_RATELIMIT === "1") {
      return false;
    }
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.cache.set(key, { count: 1, resetAt: now + this.windowMs });
      return false;
    }

    // If the window has expired, reset the counter
    if (now > entry.resetAt) {
      this.cache.set(key, { count: 1, resetAt: now + this.windowMs });
      return false;
    }

    // Increment the counter
    entry.count += 1;
    this.cache.set(key, entry);

    // Check if the rate limit is exceeded
    return entry.count > this.maxRequests;
  }

  // Get remaining time in seconds before the rate limit resets
  getRemainingTime(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;

    const now = Date.now();
    return Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.resetAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Create singleton instances for different operations
export const emailVerificationLimiter = new RateLimiter(60 * 60 * 1000, 5); // 5 requests per hour
export const loginAttemptsLimiter = new RateLimiter(15 * 60 * 1000, 10); // 10 attempts per 15 minutes
// Public, unauthenticated, DB-writing endpoint (POST /api/tiktokverification) — stands in
// for the session guard other mutating routes get, per the infra-simplification plan's
// Global Constraints ("intentionally public" routes get zod + rate limiting instead).
// CAVEAT: this class backs its counts with a plain in-memory Map (see above), so on
// Netlify's Lambda-backed functions this is a best-effort PER-INSTANCE throttle, not a
// global cap — each warm container keeps its own counts, and a cold start (or a
// request routed to a different container) resets them. It raises the bar against
// casual/single-container abuse; it does not guarantee a hard ceiling across the
// deployment. Treat it as defense-in-depth, not a promise.
export const tiktokVerificationLimiter = new RateLimiter(60 * 60 * 1000, 5); // 5 submissions per hour per warm container

// Companion to tiktokVerificationLimiter, dedicated to the presigned-upload-URL
// minting route (POST /api/tiktokverification/upload-urls). Split into its own
// instance — that route used to share tiktokVerificationLimiter's budget with the
// submission route above (same key namespace, one combined per-IP counter), which
// left a legitimate applicant only ~2.5 full attempts per hour: mint (1) -> submit ->
// a validation error -> correct it -> mint (2) -> submit hits the 6th call -> 429.
// Same per-IP shape (5/hr) and message as its sibling; the `files.max(5)` array cap
// on that route already bounds the per-request fan-out abuse this budget defends
// against, so giving it its own budget doesn't reopen that hole.
export const tiktokVerificationUploadUrlsLimiter = new RateLimiter(60 * 60 * 1000, 5); // 5 mint calls per hour per warm container

// Public, unauthenticated, DB-writing endpoint (POST /api/contact) — same
// "intentionally public" category as tiktokVerificationLimiter above (infra-
// simplification plan Phase 4a), standing in for a session guard. Own budget, not
// shared with any other route.
export const contactFormLimiter = new RateLimiter(60 * 60 * 1000, 5); // 5 submissions per hour per warm container

// Public, unauthenticated, read-only endpoint (GET /api/pear) — Phase 4c. Given its
// own instance per the "do not share a budget across endpoints" rule even though it's
// a plain list/search read, not a write: it's still an unauthenticated Prisma query
// reachable by anyone. Budget is deliberately far more generous than the write
// limiters above (30/min vs. 5/hour) because the live caller (src/app/pear/page.tsx)
// re-fetches on every keystroke of its search box — a tight budget would 429 a single
// legitimate user mid-search.
export const pearBrandsLimiter = new RateLimiter(60 * 1000, 30); // 30 requests per minute per warm container
