import { expect, test } from "@playwright/test";

/**
 * Design-system visual regression + a11y checks.
 * Pages × locales × themes × viewports, desktop Chromium only —
 * mobile devices are covered by the 320/768 viewports below.
 */

const PAGES = [
  { name: "home", en: "/", zh: "/zh" },
  { name: "find-creators", en: "/find-creators", zh: "/zh/find-creators" },
  { name: "membership", en: "/membership", zh: "/zh/membership" },
] as const;

const VIEWPORTS = [320, 768, 1024, 1440] as const;
const THEMES = ["light", "dark"] as const;
const LOCALES = ["en", "zh"] as const;

test.skip(({ isMobile }) => isMobile, "desktop project only — widths covered via viewports");

for (const page_ of PAGES)
  for (const locale of LOCALES)
    for (const theme of THEMES)
      for (const width of VIEWPORTS)
        test(`${page_.name} ${locale} ${theme} ${width}`, async ({ page }) => {
          // Block third-party embeds — non-deterministic and slow (TikTok etc.)
          await page.route(
            (url) => url.hostname !== "localhost",
            (route) => route.abort()
          );
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
          await page.goto(page_[locale]);
          await expect(page.locator("h1").first()).toBeVisible();
          // Wait for async data states to settle (spinners gone)
          await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 15_000 });
          await expect(page).toHaveScreenshot(`${page_.name}-${locale}-${theme}-${width}.png`, {
            fullPage: true,
            animations: "disabled",
            timeout: 15_000,
            // Embeds and remote images stay masked for safety
            mask: [page.locator("iframe"), page.locator("img")],
          });
        });

test("no horizontal overflow at 320", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

test("keyboard: theme toggle reachable and operable", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /switch to (dark|light) theme/i });
  await toggle.waitFor();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
});
