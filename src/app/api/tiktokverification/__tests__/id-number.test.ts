import { describe, it, expect } from "vitest";
import { z } from "zod";
import { idNumberSchema, findIdNumberCharacterMessage } from "../id-number";

const INVALID_CHARS_MESSAGE =
  "id_number contains characters that are not allowed (/, \\, %, or ..)";

describe("idNumberSchema", () => {
  it("accepts a real-world ID format with hyphen, space, and period", () => {
    const result = idNumberSchema.safeParse("AB-123 456.7");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("AB-123 456.7");
  });

  it("accepts a plain alphanumeric ID", () => {
    expect(idNumberSchema.safeParse("TEST123").success).toBe(true);
  });

  it("trims leading/trailing whitespace", () => {
    const result = idNumberSchema.safeParse("  TEST123  ");
    expect(result.success && result.data).toBe("TEST123");
  });

  it("rejects an empty string", () => {
    const result = idNumberSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects a value over the max length", () => {
    const result = idNumberSchema.safeParse("A".repeat(101));
    expect(result.success).toBe(false);
  });

  it("accepts a value at exactly the max length", () => {
    const result = idNumberSchema.safeParse("A".repeat(100));
    expect(result.success).toBe(true);
  });

  it.each([
    ["a forward slash", "TEST/123"],
    ["a backslash", "TEST\\123"],
    ["a percent sign", "TEST%123"],
    ["a path-traversal sequence", "TEST..123"],
    ["a leading path-traversal sequence", "../victim"],
  ])("rejects id_number containing %s", (_label, value) => {
    const result = idNumberSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(INVALID_CHARS_MESSAGE);
    }
  });

  const ALPHANUMERIC_REQUIRED_MESSAGE = "id_number must contain at least one letter or digit";

  it.each([
    ["a single period", "."],
    ["a single hyphen", "-"],
    ["only punctuation", "--__  -"],
  ])(
    "rejects id_number that is %s (allowed characters but no letter or digit) with a clear 400-shaped message",
    (_label, value) => {
      const result = idNumberSchema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(ALPHANUMERIC_REQUIRED_MESSAGE);
      }
    }
  );

  it("still accepts id_number values that mix punctuation with at least one alphanumeric character", () => {
    expect(idNumberSchema.safeParse("A.").success).toBe(true);
    expect(idNumberSchema.safeParse("-1").success).toBe(true);
  });
});

describe("findIdNumberCharacterMessage", () => {
  it("returns the disallowed-characters message when id_number fails the refine", () => {
    const Body = z.object({ id_number: idNumberSchema, other: z.string() });
    const parsed = Body.safeParse({ id_number: "TEST/123", other: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(findIdNumberCharacterMessage(parsed.error)).toBe(INVALID_CHARS_MESSAGE);
    }
  });

  it('returns the alphanumeric-required message when id_number is punctuation-only (e.g. ".")', () => {
    const Body = z.object({ id_number: idNumberSchema, other: z.string() });
    const parsed = Body.safeParse({ id_number: ".", other: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(findIdNumberCharacterMessage(parsed.error)).toBe(
        "id_number must contain at least one letter or digit"
      );
    }
  });

  it("returns undefined when id_number is entirely absent (a different failure mode)", () => {
    const Body = z.object({ id_number: idNumberSchema, other: z.string() });
    const parsed = Body.safeParse({ other: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(findIdNumberCharacterMessage(parsed.error)).toBeUndefined();
    }
  });

  it("returns undefined when a different field fails validation", () => {
    const Body = z.object({ id_number: idNumberSchema, other: z.string() });
    const parsed = Body.safeParse({ id_number: "TEST123", other: 42 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(findIdNumberCharacterMessage(parsed.error)).toBeUndefined();
    }
  });
});
