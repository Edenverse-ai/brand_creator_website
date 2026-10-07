import path from "node:path";
import { test, expect } from "./_helpers/fixtures";
import { E2E_CREATOR_ID, testDb } from "./_helpers/db";

test("admin uploads output for a manual task, creator sees Delivered", async ({
  asCreator,
  page,
}) => {
  const promptText = `E2E fulfillment ${Date.now()}`;

  // 1. A manually fulfilled task (no provider). The generate form now submits to
  //    the video provider and delivers automatically, so the manual path is seeded.
  const db = testDb();
  await db.aiVideoTask.create({
    data: { id: `e2efulfil${Date.now()}`, creatorId: E2E_CREATOR_ID, prompt: promptText },
  });
  await db.$disconnect();

  // 2. Admin (unauthed) finds the row, uploads an output mp4, marks DELIVERED.
  await page.goto("/storyclaw-admin");
  // Rows are <li> cards (the table layout was replaced in 331b384).
  const row = page.locator("li", { hasText: promptText });
  await expect(row).toBeVisible({ timeout: 10_000 });

  await row
    .locator('input[type="file"][accept*="video"]')
    .setInputFiles(path.join(__dirname, "fixtures/output-sample.mp4"));
  await row.getByRole("button", { name: /Upload output/i }).click();
  await expect(row.getByText("Uploaded", { exact: true })).toBeVisible({ timeout: 20_000 });

  await row.getByRole("button", { name: "Delivered", exact: true }).click();
  await row.getByRole("button", { name: /Save changes/i }).click();
  await expect(row.getByRole("button", { name: /No changes/i })).toBeVisible({ timeout: 10_000 });

  // 3. Creator returns and sees Delivered + a working "View output" link.
  await asCreator.goto("/creatorportal/ai-video/tasks");
  const taskItem = asCreator.locator("li", { hasText: promptText });
  await expect(taskItem).toBeVisible({ timeout: 10_000 });
  await expect(taskItem.getByText("Delivered")).toBeVisible();
  await expect(taskItem.getByRole("link", { name: /View output/i })).toHaveAttribute(
    "href",
    /^https?:/
  );
});
