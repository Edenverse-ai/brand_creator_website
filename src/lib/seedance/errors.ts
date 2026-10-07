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

export const CREATOR_MESSAGES = {
  copyright:
    "This video couldn't be generated because it may involve copyrighted material, such as a well-known character, brand or artwork. Please change your prompt and try again. You were not charged.",
  contentReview: "Your prompt or image didn't pass content review. Please revise and try again.",
  unavailable: "Video generation is temporarily unavailable. Please try again later.",
  startFailed: "We couldn't start this video. Please adjust your settings and try again.",
  unknownOutcome:
    "We couldn't confirm your submission. Please check your tasks before trying again.",
  timedOut: "Generation timed out. You were not charged.",
  generationFailed: "Video generation failed. You were not charged — please try again.",
} as const;

export type SubmitFailureCode = "submit_rejected" | "unknown_outcome";

// The provider reports reasons as free text (English or Chinese) or as upstream
// error codes such as InputTextSensitiveContentDetected.
const COPYRIGHT_PATTERN = /copyright|版权|侵权/i;
const CONTENT_REVIEW_PATTERN = /审核|违规|敏感|content[_ ]?policy|moderation|safety|sensitive/i;
const PASSTHROUGH_REASON_MAX_LENGTH = 300;

function knownReasonMessage(providerText: string): string | null {
  if (COPYRIGHT_PATTERN.test(providerText)) return CREATOR_MESSAGES.copyright;
  if (CONTENT_REVIEW_PATTERN.test(providerText)) return CREATOR_MESSAGES.contentReview;
  return null;
}

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
      message: knownReasonMessage(error.providerMessage) ?? CREATOR_MESSAGES.startFailed,
    };
  }
  return { failureCode: "submit_rejected", message: CREATOR_MESSAGES.unavailable };
}

/**
 * Message for a task the provider accepted and later reported as failed. Creators
 * see why: a specific message for copyright and content-review rejections,
 * otherwise the provider's own reason. The trailing "Request id: …" is support
 * detail and is dropped here; it stays in the server log and on the task's traceId.
 */
export function describeProviderFailure(providerError: string): string {
  const known = knownReasonMessage(providerError);
  if (known) return known;

  const reason = providerError
    .replace(/\s*Request id:[\s\S]*$/i, "")
    .trim()
    .slice(0, PASSTHROUGH_REASON_MAX_LENGTH)
    .replace(/[.。]+$/, "");
  return reason
    ? `Video generation failed: ${reason}. You were not charged.`
    : CREATOR_MESSAGES.generationFailed;
}
