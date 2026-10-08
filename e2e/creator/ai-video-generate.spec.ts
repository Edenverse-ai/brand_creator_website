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

    const model = asCreator.getByRole("button", { name: "Model" });
    const format = asCreator.getByRole("button", { name: "Format" });
    const slider = asCreator.getByRole("slider", { name: "Duration" });
    const pickModel = async (name: RegExp) => {
      await model.click();
      await asCreator.getByRole("menuitem", { name }).click();
    };

    // Seedance 2.5 is the default: up to 30 s, but no 1080p.
    await expect(model).toContainText("Seedance 2.5");
    await format.click();
    await expect(slider).toHaveAttribute("max", "30");
    await expect(asCreator.getByRole("button", { name: "1080p", exact: true })).toHaveCount(0);
    await slider.fill("30");
    await asCreator.keyboard.press("Escape");
    await expect(format).toContainText("30s");

    // Two models, both free to pick. Mini trades length for 1080p, and switching
    // pulls the format back inside the new model's limits.
    await model.click();
    await expect(asCreator.getByRole("menuitem")).toHaveCount(2);
    await expect(asCreator.getByRole("menu")).not.toContainText("PRO");
    await asCreator.getByRole("menuitem", { name: /Seedance 2\.0 Mini/ }).click();
    await expect(format).toContainText("15s");
    await format.click();
    await expect(slider).toHaveAttribute("max", "15");
    await asCreator.getByRole("button", { name: "1080p", exact: true }).click();
    await asCreator.keyboard.press("Escape");
    await expect(format).toContainText("1080p");

    await pickModel(/Seedance 2\.5/);
    await expect(format).toContainText("720p");

    // Format popover: ratio (with shape glyphs), resolution, duration slider.
    await format.click();
    await asCreator.getByRole("button", { name: "9:16", exact: true }).click();
    await asCreator.getByRole("button", { name: "480p", exact: true }).click();
    await slider.fill("4");
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

    // A creator's first video is named ai-video-1. Clicking anywhere on the frame
    // plays it in a dialog headed by name, prompt and format, no taller than 90% of
    // the viewport, with the browser's own player and the details underneath.
    await expect(asCreator.locator("#library article").getByText("ai-video-1")).toBeVisible();
    await asCreator.getByRole("button", { name: "Play ai-video-1" }).click();
    const dialog = asCreator.getByRole("dialog", { name: "ai-video-1" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "ai-video-1" })).toBeVisible();
    await expect(dialog.getByText(prompt)).toBeVisible();
    await expect(dialog.getByText("Seedance 2.5 · 9:16 · 480p · 4s")).toBeVisible();
    await expect(dialog.locator("video")).toHaveJSProperty("controls", true);
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
    expect(redirect.headers()["location"]).toContain("download=ai-video-1.mp4");
    const file = await asCreator.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toContain("attachment");

    const db = testDb();
    const task = await db.aiVideoTask.findFirst({ where: { creatorId: E2E_CREATOR_ID, prompt } });
    await db.$disconnect();
    expect(task?.params).toMatchObject({
      mode: "seedance2.5",
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

  test("renames and deletes a video in My Videos", async ({ asCreator }) => {
    test.setTimeout(90_000);
    const prompt = `E2E manage ${Date.now()}`;

    await asCreator.goto("/creatorportal/ai-video/generate");
    await asCreator.getByLabel(/^Prompt$/i).fill(prompt);
    await asCreator.getByRole("button", { name: /Generate video/i }).click();
    await expect(asCreator.locator("video")).toBeVisible({ timeout: 45_000 });

    // A second library entry (sharing the first one's file) to collide names with.
    const db = testDb();
    const first = await db.aiVideo.findFirstOrThrow({ where: { creator_id: E2E_CREATOR_ID } });
    await db.aiVideo.create({
      data: {
        creator_id: E2E_CREATOR_ID,
        generated_time: new Date(Date.now() - 60_000),
        video: first.video,
        name: "Older clip",
      },
    });
    await db.$disconnect();

    await asCreator.goto("/creatorportal/ai-video");
    const library = asCreator.locator("#library");
    await expect(library.locator("article")).toHaveCount(2);

    // Rename from the player: a name another video has is refused, a new one is saved.
    await asCreator.getByRole("button", { name: "Play ai-video-1" }).click();
    const player = asCreator.getByRole("dialog");
    await player.getByRole("button", { name: "Edit name" }).click();
    const nameField = player.getByRole("textbox", { name: "Video name" });
    await expect(nameField).toHaveValue("ai-video-1");

    await nameField.fill("Older clip");
    await player.getByRole("button", { name: "Save" }).click();
    await expect(player.getByRole("alert")).toHaveText("You already have a video with this name.");

    await nameField.fill("   ");
    await player.getByRole("button", { name: "Save" }).click();
    await expect(player.getByRole("alert")).toHaveText("A video needs a name.");

    await nameField.fill("Launch teaser");
    await player.getByRole("button", { name: "Save" }).click();
    await expect(player.getByRole("heading", { name: "Launch teaser" })).toBeVisible();
    await player.getByRole("button", { name: "Close" }).click();
    await expect(library.locator("article").getByText("Launch teaser")).toBeVisible();

    await asCreator.reload();
    await expect(library.locator("article").getByText("Launch teaser")).toBeVisible();
    await expect(library.getByText("ai-video-1")).toHaveCount(0);

    // Selecting shows the actions inside the library, between its header and the
    // grid: Clear, Delete, Download, Post to TikTok.
    const tile = library.locator("article", { hasText: "Launch teaser" });
    await tile.locator("input[type=checkbox]").check({ force: true });
    const toolbar = library.getByRole("toolbar", { name: "Selected video" });
    await expect(toolbar).toContainText("Launch teaser");
    const actions = await toolbar
      .locator("button, a")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") ?? node.textContent?.trim())
      );
    expect(actions).toEqual(["Clear", "Delete", "Download", "Post to TikTok"]);
    const header = (await library.getByRole("heading", { name: "My videos" }).boundingBox())!;
    const bar = (await toolbar.boundingBox())!;
    const grid = (await tile.boundingBox())!;
    expect(bar.y).toBeGreaterThan(header.y);
    expect(bar.y + bar.height).toBeLessThanOrEqual(grid.y);

    // Deleting asks first and says it can't be undone.
    await toolbar.getByRole("button", { name: "Delete" }).click();
    const confirm = asCreator.getByRole("alertdialog");
    await expect(confirm).toContainText("Delete Launch teaser?");
    await expect(confirm).toContainText("can't be recovered");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(library.locator("article")).toHaveCount(2);

    await toolbar.getByRole("button", { name: "Delete" }).click();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(confirm).toBeHidden();
    await expect(library.getByText("Launch teaser")).toHaveCount(0);
    await expect(toolbar).toBeHidden();

    // Only that video's row is gone. (The other entry shared its file, so the page
    // can no longer show it; the database is what tells the two apart.)
    const after = testDb();
    const remaining = await after.aiVideo.findMany({ where: { creator_id: E2E_CREATOR_ID } });
    await after.$disconnect();
    expect(remaining.map((video) => video.name)).toEqual(["Older clip"]);

    // The generation task stays on record, without a video to open.
    await asCreator.goto("/creatorportal/ai-video/tasks");
    const row = asCreator.locator("li", { hasText: prompt });
    await expect(row.getByText("Delivered")).toBeVisible();
    await expect(row.getByRole("link", { name: /View output/i })).toHaveCount(0);
  });

  test("keeps the stacked layout on small screens, with model and ratio glyphs", async ({
    asCreator,
  }) => {
    await asCreator.setViewportSize({ width: 390, height: 844 });
    await asCreator.goto("/creatorportal/ai-video/generate");

    await expect(asCreator.getByRole("heading", { name: "Format" })).toBeVisible();
    await expect(asCreator.getByRole("button", { name: "Format" })).toBeHidden();
    await expect(asCreator.getByRole("button", { name: "Model" })).toContainText("Seedance 2.5");
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
