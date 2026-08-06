import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "@/components/ui/Button";

test("pill variant renders accent pill", () => {
  render(<Button variant="pill">Browse creators</Button>);
  const b = screen.getByRole("button", { name: "Browse creators" });
  expect(b.className).toContain("rounded-full");
  expect(b.className).toContain("bg-accent");
});
