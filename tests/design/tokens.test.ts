import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { contrast } from "./wcag";

const css = readFileSync("src/styles/themes.css", "utf8");

function block(selector: string): Record<string, string> {
  const m = css.match(new RegExp(`${selector.replace(/[[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`missing block ${selector}`);
  return Object.fromEntries(
    [...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()])
  );
}

const light = block(":root");
const dark = block('[data-theme="dark"]');

test("every semantic token defined in both themes", () => {
  expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
});

describe.each([
  ["light", light],
  ["dark", dark],
])("%s contrast", (_, t) => {
  test("ink on surface >= 7", () =>
    expect(contrast(t["ink"], t["surface"])).toBeGreaterThanOrEqual(7));
  test("ink-muted on surface >= 4.5", () =>
    expect(contrast(t["ink-muted"], t["surface"])).toBeGreaterThanOrEqual(4.5));
  test("accent-contrast on accent >= 4.5 (button text)", () =>
    expect(contrast(t["accent-contrast"], t["accent"])).toBeGreaterThanOrEqual(4.5));
});
