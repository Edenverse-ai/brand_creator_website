/**
 * Provider errors and their creator-facing messages.
 *
 * Raw provider text and trace ids go to server logs only; creators see one of
 * CREATOR_MESSAGES. None of these errors ever carries the API key.
 */

export class ProviderRequestError extends Error {
  constructor(
    public readonly code: number,
    public readonly providerMessage: string,
    public readonly traceId: string | null
  ) {
    super(`Video provider rejected the request (code ${code})`);
    this.name = "ProviderRequestError";
  }
}

export class ProviderBalanceError extends Error {
  constructor(public readonly traceId: string | null) {
    super("Video provider account balance is insufficient");
    this.name = "ProviderBalanceError";
  }
}

/** Definitive transport/system failure: the provider did not accept the request. */
export class ProviderSystemError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly traceId: string | null
  ) {
    super(`Video provider request failed (HTTP ${httpStatus || "network"})`);
    this.name = "ProviderSystemError";
  }
}

/**
 * The create call may or may not have produced a (billable) task — timeout,
 * dropped connection, 5xx, unparseable success. Never retried automatically.
 */
export class ProviderUnknownOutcomeError extends Error {
  constructor(cause: unknown) {
    super("Video provider create outcome unknown", { cause });
    this.name = "ProviderUnknownOutcomeError";
  }
}

export class LiveProviderBlockedError extends Error {
  constructor() {
    super("Live video provider is disabled in test/E2E environments");
    this.name = "LiveProviderBlockedError";
  }
}

export const CREATOR_MESSAGES = {
  contentReview: "Your prompt or image didn't pass content review. Please revise and try again.",
  unavailable: "Video generation is temporarily unavailable. Please try again later.",
  startFailed: "We couldn't start this video. Please adjust your settings and try again.",
  unknownOutcome:
    "We couldn't confirm your submission. Please check your tasks before trying again.",
  timedOut: "Generation timed out. You were not charged.",
  generationFailed: "Video generation failed. You were not charged — please try again.",
} as const;

export type SubmitFailureCode = "submit_rejected" | "unknown_outcome";

const CONTENT_REVIEW_PATTERN = /审核|content[_ ]?policy|moderation|safety/i;

export function describeSubmitError(error: unknown): {
  failureCode: SubmitFailureCode;
  message: string;
} {
  if (error instanceof ProviderUnknownOutcomeError) {
    return { failureCode: "unknown_outcome", message: CREATOR_MESSAGES.unknownOutcome };
  }
  if (error instanceof ProviderRequestError) {
    return {
      failureCode: "submit_rejected",
      message: CONTENT_REVIEW_PATTERN.test(error.providerMessage)
        ? CREATOR_MESSAGES.contentReview
        : CREATOR_MESSAGES.startFailed,
    };
  }
  return { failureCode: "submit_rejected", message: CREATOR_MESSAGES.unavailable };
}

/** Message for a task the provider accepted and later reported as failed. */
export function describeProviderFailure(providerError: string): string {
  return CONTENT_REVIEW_PATTERN.test(providerError)
    ? CREATOR_MESSAGES.contentReview
    : CREATOR_MESSAGES.generationFailed;
}
