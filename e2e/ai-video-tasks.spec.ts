import path from "node:path";
import { test, expect } from "./_helpers/fixtures";

test("creator submits a generation with a reference image and sees it in the list", async ({
  asCreator,
}) => {
  const prompt = `E2E smoke prompt ${Date.now()}`;

  await asCreator.goto("/creatorportal/ai-video/generate");
  await asCreator.getByLabel(/^Prompt$/i).fill(prompt);
  await asCreator
    .locator("input#reference-image")
    .setInputFiles(path.join(__dirname, "fixtures/reference-512.png"));
  await asCreator.getByRole("button", { name: /Generate video/i }).click();

  await expect(asCreator.getByText(/Generating/i).first()).toBeVisible({ timeout: 15_000 });

  await asCreator.goto("/creatorportal/ai-video/tasks");
  await expect(asCreator.getByText(prompt)).toBeVisible();
});
