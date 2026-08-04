import { describe, it, expect } from "vitest";
import { isValidUuid } from "../validation";

describe("isValidUuid", () => {
  it("accepts a canonical lowercase UUID", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts a canonical uppercase UUID", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("abc")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });

  it("rejects a UUID missing dashes", () => {
    expect(isValidUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects a string with a UUID embedded in extra text", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000; DROP TABLE campaigns")).toBe(false);
  });
});
