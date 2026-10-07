import { describe, it, expect } from "vitest";
import {
  CREATOR_MESSAGES,
  ProviderBalanceError,
  ProviderRequestError,
  ProviderSystemError,
  ProviderUnknownOutcomeError,
  describeProviderFailure,
  describeSubmitError,
} from "../errors";

describe("describeSubmitError", () => {
  it("maps an unknown outcome to unknown_outcome (counts against the cap)", () => {
    expect(describeSubmitError(new ProviderUnknownOutcomeError(new Error("x")))).toEqual({
      failureCode: "unknown_outcome",
      message: CREATOR_MESSAGES.unknownOutcome,
    });
  });

  it("hides balance problems behind 'temporarily unavailable'", () => {
    expect(describeSubmitError(new ProviderBalanceError("tr"))).toEqual({
      failureCode: "submit_rejected",
      message: CREATOR_MESSAGES.unavailable,
    });
  });

  it("hides auth/IP problems behind 'temporarily unavailable'", () => {
    expect(describeSubmitError(new ProviderSystemError(401, null))).toEqual({
      failureCode: "submit_rejected",
      message: CREATOR_MESSAGES.unavailable,
    });
  });

  it("maps a content-review rejection to the review message", () => {
    expect(
      describeSubmitError(new ProviderRequestError(1, "输入内容未通过审核", "tr")).message
    ).toBe(CREATOR_MESSAGES.contentReview);
  });

  it("maps other business errors to 'couldn't start'", () => {
    expect(describeSubmitError(new ProviderRequestError(1, 'invalid ratio "x"', "tr"))).toEqual({
      failureCode: "submit_rejected",
      message: CREATOR_MESSAGES.startFailed,
    });
  });

  it("treats anything unexpected as unavailable", () => {
    expect(describeSubmitError(new Error("boom")).message).toBe(CREATOR_MESSAGES.unavailable);
  });
});

describe("describeProviderFailure", () => {
  it("tells the creator when the failure is about copyright", () => {
    // Real provider text from a failed generation (prompt named a film character).
    expect(
      describeProviderFailure(
        "The request failed because the output video may be related to copyright restrictions. Request id: 02179140332047500000000000000000000ffffac18033c873b61"
      )
    ).toBe(CREATOR_MESSAGES.copyright);
    expect(describeProviderFailure("生成失败：输入内容涉及版权 IP，未通过校验")).toBe(
      CREATOR_MESSAGES.copyright
    );
  });

  it.each([
    "生成失败：输入内容未通过审核",
    "content_policy_violation",
    "内容违规",
    "包含敏感信息",
    "InputTextSensitiveContentDetected",
  ])("recognises content review failures: %s", (error) => {
    expect(describeProviderFailure(error)).toBe(CREATOR_MESSAGES.contentReview);
  });

  it("shows the provider's own reason for anything else, without the request id", () => {
    expect(
      describeProviderFailure(
        "The reference image could not be downloaded. Request id: 0217914033abc"
      )
    ).toBe(
      "Video generation failed: The reference image could not be downloaded. You were not charged."
    );
  });

  it("keeps a passed-through reason to a readable length", () => {
    const message = describeProviderFailure("x".repeat(1000));
    expect(message.length).toBeLessThan(400);
    expect(message.endsWith("You were not charged.")).toBe(true);
  });

  it("falls back to a generic message when the provider gives no reason", () => {
    expect(describeProviderFailure("")).toBe(CREATOR_MESSAGES.generationFailed);
    expect(describeProviderFailure("  Request id: abc")).toBe(CREATOR_MESSAGES.generationFailed);
  });
});
