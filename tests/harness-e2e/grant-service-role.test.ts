import { describe, it, expect } from "vitest";
import { grantServiceRole } from "../../scripts/e2e/grant-service-role";

describe("grantServiceRole", () => {
  it("refuses a non-local DATABASE_URL before touching the network", async () => {
    // A real (unreachable) host — if the guard were bypassed, this would
    // hang/fail on a connection attempt instead of throwing synchronously.
    await expect(
      grantServiceRole("postgres://prod:prod@db.prod.internal:5432/app")
    ).rejects.toThrow(/refusing/i);
  });

  it("refuses an undefined-shaped DATABASE_URL", async () => {
    await expect(grantServiceRole(undefined as unknown as string)).rejects.toThrow(/DATABASE_URL/);
  });
});
