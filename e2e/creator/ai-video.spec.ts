import { test, expect } from "../_helpers/fixtures";

test.describe("creator / ai-video dashboard", () => {
  test("loads AI Video Library for authenticated creator", async ({ asCreator }) => {
    await asCreator.goto("/creatorportal/ai-video");
    await expect(asCreator).toHaveURL(/\/creatorportal\/ai-video/);
    await expect(asCreator.getByRole("heading", { name: "My videos" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("exposes path to generate flow", async ({ asCreator }) => {
    await asCreator.goto("/creatorportal/ai-video");
    const generateLink = asCreator
      .getByRole("link", { name: /generate/i })
      .or(asCreator.getByRole("button", { name: /generate/i }))
      .first();
    await expect(generateLink).toBeVisible();
  });
});
