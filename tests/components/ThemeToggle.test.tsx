import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { describe, expect, test } from "vitest";
import ThemeToggle from "@/components/ui/ThemeToggle";

describe("ThemeToggle", () => {
  test("cycles theme and sets data-theme attribute", async () => {
    render(
      <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>
    );
    const btn = await screen.findByRole("button", { name: /switch to dark theme/i });
    await userEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
