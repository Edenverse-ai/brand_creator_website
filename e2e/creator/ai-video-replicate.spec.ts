import path from "node:path";
import { test, expect } from "../_helpers/fixtures";
import { E2E_CREATOR_ID, testDb } from "../_helpers/db";

/**
 * Trend Replicate against the MOCK video provider (see src/lib/seedance/index.ts).
 * The E2E creator is on the free tier: one replicate per day, sources up to 15 s.
 *
 * replicate-source-3s.mp4 / replicate-source-16s.mp4 are VP9-in-MP4 canvas clips
 * recorded with Playwright's Chromium, so every CI browser can decode them.
 */

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

test.describe.configure({ mode: "serial" });

test.describe("creator / ai-video replicate", () => {
  test.beforeEach(async () => {
    const db = testDb();
    await db.aiVideoTask.deleteMany({ where: { creatorId: E2E_CREATOR_ID } });
    await db.aiVideo.deleteMany({ where: { creator_id: E2E_CREATOR_ID } });
    await db.$disconnect();
  });

  test("the tool tabs switch between Video Gen and Trend Replicate", async ({ asCreator }) => {
    await asCreator.goto("/creatorportal/ai-video/generate");
    const tools = asCreator.getByRole("navigation", { name: "AI video tools" });
    await expect(tools.getByRole("link", { name: "Video Gen" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await tools.getByRole("link", { name: "Trend Replicate" }).click();
    await expect(asCreator).toHaveURL(/\/creatorportal\/ai-video\/replicate$/);
    await expect(
      asCreator.getByRole("heading", { name: "Replicate a trending video" })
    ).toBeVisible();
    await expect(tools.getByRole("link", { name: "Trend Replicate" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("replicates a trending video and delivers it to History", async ({ asCreator }) => {
    test.setTimeout(90_000);
    const productName = `E2E Bag ${Date.now()}`;

    await asCreator.goto("/creatorportal/ai-video/replicate");
    await expect(asCreator.getByText(/Mock mode/i)).toBeVisible();
    await expect(asCreator.getByText(/1 free replicate left today/i)).toBeVisible();
    const submit = asCreator.getByRole("button", { name: /Replicate video/i });
    await expect(submit).toBeDisabled();

    // Free tier: the source must be 2–15 s.
    const videoInput = asCreator.locator("input#original-video");
    await videoInput.setInputFiles(fixture("replicate-source-16s.mp4"));
    await expect(asCreator.getByText(/can be up to 15 seconds/i)).toBeVisible();
    await videoInput.setInputFiles(fixture("output-sample.mp4"));
    await expect(asCreator.getByText(/at least 2 seconds/i)).toBeVisible();

    await videoInput.setInputFiles(fixture("replicate-source-3s.mp4"));
    await expect(asCreator.getByLabel("Original video preview")).toBeVisible();
    await expect(asCreator.getByText(/Output ≈ 4 s/)).toBeVisible();

    await asCreator
      .locator("input#product-images")
      .setInputFiles([fixture("reference-512.png"), fixture("reference-512.png")]);
    await expect(asCreator.getByAltText("Product image 2")).toBeVisible();

    await asCreator.getByLabel(/Product name/i).fill(productName);
    await asCreator.getByLabel(/Target audience/i).fill("women 25-35");
    await asCreator.getByLabel(/Selling points/i).fill("vegan leather, gold clasp");
    await submit.click();

    const item = asCreator.getByTestId("replicate-history-item").filter({ hasText: productName });
    await expect(item.getByText("Generating")).toBeVisible({ timeout: 30_000 });
    await expect(asCreator.getByText(/0 free replicates left today/i)).toBeVisible();
    await expect(item.locator("video")).toBeVisible({ timeout: 45_000 });
    await expect(item.getByText("Delivered")).toBeVisible();

    const db = testDb();
    const task = await db.aiVideoTask.findFirst({
      where: { creatorId: E2E_CREATOR_ID, kind: "replicate" },
    });
    await db.$disconnect();
    expect(task?.referenceVideoPath).toMatch(/\/reference-video\.mp4$/);
    expect(task?.productImagePaths).toHaveLength(2);
    expect(task?.params).toMatchObject({ ratio: "adaptive", duration: 4 });
    expect(task?.prompt).toContain(`The product is "${productName}", shown in Image 1 and Image 2`);

    // The task list marks it as a replicate and shows the product name.
    await asCreator.goto("/creatorportal/ai-video/tasks");
    const row = asCreator.locator("li", { hasText: productName });
    await expect(row.getByText("Replicate", { exact: true })).toBeVisible();

    // History survives a reload, with the delivered video.
    await asCreator.goto("/creatorportal/ai-video/replicate");
    await expect(item.locator("video")).toBeVisible();
    await expect(submit).toBeDisabled();
  });

  test("shows the failure on the History item when generation fails", async ({ asCreator }) => {
    test.setTimeout(90_000);

    await asCreator.goto("/creatorportal/ai-video/replicate");
    await asCreator
      .locator("input#original-video")
      .setInputFiles(fixture("replicate-source-3s.mp4"));
    await asCreator.locator("input#product-images").setInputFiles(fixture("reference-512.png"));
    await asCreator.getByLabel(/Product name/i).fill("E2E failing bag [mock-fail]");
    await asCreator.getByRole("button", { name: /Replicate video/i }).click();

    const item = asCreator
      .getByTestId("replicate-history-item")
      .filter({ hasText: "E2E failing bag" });
    await expect(item.getByText("Failed", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(item.getByText(/You were not charged/i)).toBeVisible();
  });

  test("blocks a second free replicate on the same day", async ({ asCreator }) => {
    const db = testDb();
    const now = new Date();
    await db.aiVideoTask.create({
      data: {
        id: `e2erepcap${now.getTime()}`,
        creatorId: E2E_CREATOR_ID,
        kind: "replicate",
        prompt: "cap filler",
        replicateInput: { productName: "Earlier bag" },
        status: "DELIVERED",
        submitStartedAt: now,
      },
    });
    await db.$disconnect();

    await asCreator.goto("/creatorportal/ai-video/replicate");
    await expect(asCreator.getByText(/0 free replicates left today/i)).toBeVisible();
    await asCreator
      .locator("input#original-video")
      .setInputFiles(fixture("replicate-source-3s.mp4"));
    await asCreator.locator("input#product-images").setInputFiles(fixture("reference-512.png"));
    await asCreator.getByLabel(/Product name/i).fill("should not submit");
    await expect(asCreator.getByRole("button", { name: /Replicate video/i })).toBeDisabled();

    // Video Gen keeps its own allowance.
    await asCreator.goto("/creatorportal/ai-video/generate");
    await expect(asCreator.getByText(/5 generations left today/i)).toBeVisible();
  });
});
