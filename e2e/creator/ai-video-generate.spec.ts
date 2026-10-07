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
    await db.aiVideo.deleteMany({ where: { creator_id: E2E_CREATOR_ID } });
    await db.$disconnect();
  });

  test("generates a video and delivers it to My Videos", async ({ asCreator }) => {
    test.setTimeout(90_000);
    const prompt = `E2E generate ${Date.now()}`;

    await asCreator.goto("/creatorportal/ai-video/generate");
    await expect(asCreator.getByText(/Mock mode/i)).toBeVisible();

    await asCreator.getByLabel(/^Prompt$/i).fill(prompt);

    // Model picker: the cheapest model is free, the rest are shown as PRO and locked.
    await asCreator.getByRole("button", { name: "Model" }).click();
    await expect(asCreator.getByRole("menuitem", { name: "Seedance 2.0 Mini" })).toBeEnabled();
    for (const locked of ["Seedance 2.0 Fast", "Seedance 2.0 Pro", "Seedance 2.5"]) {
      const item = asCreator.getByRole("menuitem", { name: locked });
      await expect(item).toContainText("PRO");
      await expect(item).toBeDisabled();
    }
    await asCreator.keyboard.press("Escape");

    // Format popover: ratio (with shape glyphs), resolution, duration slider.
    const format = asCreator.getByRole("button", { name: "Format" });
    await format.click();
    await asCreator.getByRole("button", { name: "9:16", exact: true }).click();
    await asCreator.getByRole("button", { name: "480p", exact: true }).click();
    await asCreator.getByRole("slider", { name: "Duration" }).fill("4");
    await asCreator.keyboard.press("Escape");
    await expect(format).toContainText("480p");
    await expect(format).toContainText("4s");

    await asCreator.getByRole("button", { name: /Generate video/i }).click();

    await expect(asCreator.getByText(/Generating/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(asCreator.locator("video")).toBeVisible({ timeout: 45_000 });
    await expect(asCreator.getByRole("link", { name: /My Videos/i })).toBeVisible();

    await asCreator.goto("/creatorportal/ai-video");
    await expect(asCreator.getByText(/1 ready/i).first()).toBeVisible({ timeout: 10_000 });

    // The tile shows the video's first frame, so the creator can tell videos apart.
    const frame = asCreator.getByTestId("video-tile-frame").first();
    await expect(frame).toBeVisible();
    await expect
      .poll(() => frame.evaluate((el) => (el as HTMLVideoElement).videoWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Clicking anywhere on the frame plays it in a dialog named after the prompt,
    // no taller than 90% of the viewport, with the details under the player.
    await asCreator.getByRole("button", { name: `Play ${prompt}` }).click();
    const dialog = asCreator.getByRole("dialog", { name: prompt });
    await expect(dialog).toBeVisible();
    const viewport = asCreator.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(viewport.height * 0.9 + 1);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
    const player = (await dialog.locator("video").boundingBox())!;
    const details = (await dialog.getByText(/Download window ends/).boundingBox())!;
    expect(player.height).toBeGreaterThan(100);
    expect(details.y).toBeGreaterThan(player.y + player.height);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    // The tile's own download button, and selecting without opening the player.
    await expect(asCreator.getByRole("link", { name: "Download video" })).toHaveAttribute(
      "href",
      /^\/api\/ai-videos\/library\/[0-9a-f-]{36}\/download$/
    );

    // Selecting a video offers Download; the link redirects to a signed URL that
    // saves the file (Content-Disposition via Supabase's `download` parameter).
    await asCreator.locator("#library input[type=checkbox]").first().check({ force: true });
    await expect(dialog).toBeHidden();
    const download = asCreator.getByRole("link", { name: "Download", exact: true });
    await expect(download).toBeVisible();
    const href = await download.getAttribute("href");
    expect(href).toMatch(/^\/api\/ai-videos\/library\/[0-9a-f-]{36}\/download$/);
    const redirect = await asCreator.request.get(href!, { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers()["location"]).toContain("download=cricher-ai-video-");
    const file = await asCreator.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toContain("attachment");

    const db = testDb();
    const task = await db.aiVideoTask.findFirst({ where: { creatorId: E2E_CREATOR_ID, prompt } });
    await db.$disconnect();
    expect(task?.params).toMatchObject({
      mode: "mini",
      ratio: "9:16",
      resolution: "480p",
      duration: 4,
    });

    await asCreator.goto("/creatorportal/ai-video/tasks");
    const row = asCreator.locator("li", { hasText: prompt });
    await expect(row.getByText("Delivered")).toBeVisible();
    await expect(row.getByRole("link", { name: /View output/i })).toHaveAttribute(
      "href",
      /^https?:/
    );
  });

  test("keeps the stacked layout on small screens, with model and ratio glyphs", async ({
    asCreator,
  }) => {
    await asCreator.setViewportSize({ width: 390, height: 844 });
    await asCreator.goto("/creatorportal/ai-video/generate");

    await expect(asCreator.getByRole("heading", { name: "Format" })).toBeVisible();
    await expect(asCreator.getByRole("button", { name: "Format" })).toBeHidden();
    await expect(asCreator.getByRole("button", { name: "Model" })).toContainText(
      "Seedance 2.0 Mini"
    );
    await asCreator.getByRole("button", { name: "16:9", exact: true }).click();
    await expect(asCreator.getByRole("button", { name: "16:9", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(asCreator.getByRole("slider", { name: "Duration" })).toBeVisible();

    await asCreator.getByLabel(/^Prompt$/i).fill("E2E small screen");
    await asCreator.getByRole("button", { name: /Generate video/i }).click();
    await expect(asCreator.getByText(/Generating your video/i)).toBeVisible({ timeout: 15_000 });
  });

  test("shows a failure and lets the creator try again", async ({ asCreator }) => {
    test.setTimeout(90_000);

    await asCreator.goto("/creatorportal/ai-video/generate");
    await asCreator.getByLabel(/^Prompt$/i).fill("E2E failing prompt [mock-fail]");
    await asCreator.getByRole("button", { name: /Generate video/i }).click();

    await expect(asCreator.getByText(/generation failed/i)).toBeVisible({ timeout: 45_000 });
    await asCreator.getByRole("button", { name: /Try again/i }).click();
    await expect(asCreator.getByLabel(/^Prompt$/i)).toHaveValue("E2E failing prompt [mock-fail]");

    await asCreator.goto("/creatorportal/ai-video/tasks");
    const row = asCreator.locator("li", { hasText: "E2E failing prompt" });
    await expect(row.getByText("Failed", { exact: true })).toBeVisible();
    await expect(row.getByText(/You were not charged/i)).toBeVisible();
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
