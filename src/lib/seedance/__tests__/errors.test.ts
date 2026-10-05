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
  it("recognises content review failures", () => {
    expect(describeProviderFailure("生成失败：输入内容未通过审核")).toBe(
      CREATOR_MESSAGES.contentReview
    );
    expect(describeProviderFailure("content_policy_violation")).toBe(
      CREATOR_MESSAGES.contentReview
    );
  });

  it("falls back to a generic not-charged message", () => {
    expect(describeProviderFailure("InvalidParameter.TaskTypeConstraint")).toBe(
      CREATOR_MESSAGES.generationFailed
    );
  });
});
