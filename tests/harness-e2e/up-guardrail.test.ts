import { describe, it, expect } from "vitest";
import { assertTestDatabaseUrl } from "../../scripts/e2e/up";

describe("assertTestDatabaseUrl", () => {
  it("throws on prod-looking URL", () => {
    expect(() => assertTestDatabaseUrl("postgres://prod:prod@db.prod.internal:5432/app")).toThrow(
      /refusing/i
    );
  });

  it("throws on default dev port 5432", () => {
    expect(() => assertTestDatabaseUrl("postgres://dev:dev@localhost:5432/dev")).toThrow(
      /refusing/i
    );
  });

  it("accepts test port 54329", () => {
    expect(() =>
      assertTestDatabaseUrl("postgres://postgres:postgres@localhost:54329/postgres")
    ).not.toThrow();
  });

  it("throws on undefined", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
  });
});
