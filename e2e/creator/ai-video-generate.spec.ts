import { test, expect } from "../_helpers/fixtures";
import { E2E_CREATOR_ID, testDb } from "../_helpers/db";

/**
 * Generate page against the MOCK video provider (the E2E environment can never
 * reach the live one — see src/lib/seedance/index.ts). The mock finishes about
 * 10 s after submission and the page polls every 10 s.
 */

test.describe.configure({ mode: "serial" });

test.describe("creator / ai-video generate", () => {
  test.beforeEach(async () => {
    const db = testDb();
    await db.aiVideoTask.deleteMany({ where: { creatorId: E2E_CREATOR_ID } });
    await db.$disconnect();
  });

  test("generates a video and delivers it to My Videos", async ({ asCreator }) => {
    test.setTimeout(90_000);
    const prompt = `E2E generate ${Date.now()}`;

    await asCreator.goto("/creatorportal/ai-video/generate");
    await expect(asCreator.getByText(/Mock mode/i)).toBeVisible();

    await asCreator.getByLabel(/^Prompt$/i).fill(prompt);
    await asCreator.getByRole("button", { name: "9:16", exact: true }).click();
    await asCreator.getByRole("button", { name: "5s", exact: true }).click();
    await asCreator.getByRole("button", { name: "480p", exact: true }).click();
    await asCreator.getByRole("button", { name: /Generate video/i }).click();

    await expect(asCreator.getByText(/Generating/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(asCreator.locator("video")).toBeVisible({ timeout: 45_000 });
    await expect(asCreator.getByRole("link", { name: /My Videos/i })).toBeVisible();

    await asCreator.goto("/creatorportal/ai-video");
    await expect(asCreator.getByText(/1 ready/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows a failure and lets the creator try again", async ({ asCreator }) => {
    test.setTimeout(90_000);

    await asCreator.goto("/creatorportal/ai-video/generate");
    await asCreator.getByLabel(/^Prompt$/i).fill("E2E failing prompt [mock-fail]");
    await asCreator.getByRole("button", { name: /Generate video/i }).click();

    await expect(asCreator.getByText(/generation failed/i)).toBeVisible({ timeout: 45_000 });
    await asCreator.getByRole("button", { name: /Try again/i }).click();
    await expect(asCreator.getByLabel(/^Prompt$/i)).toHaveValue("E2E failing prompt [mock-fail]");
  });

  test("blocks generation once the daily cap is reached", async ({ asCreator }) => {
    const db = testDb();
    const now = new Date();
    await db.aiVideoTask.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `e2ecap${i}${now.getTime()}`,
        creatorId: E2E_CREATOR_ID,
        prompt: "cap filler",
        status: "DELIVERED" as const,
        submitStartedAt: now,
      })),
    });
    await db.$disconnect();

    await asCreator.goto("/creatorportal/ai-video/generate");
    await expect(asCreator.getByText(/0 generations left today/i)).toBeVisible();
    await asCreator.getByLabel(/^Prompt$/i).fill("should not submit");
    await expect(asCreator.getByRole("button", { name: /Generate video/i })).toBeDisabled();
  });
});
