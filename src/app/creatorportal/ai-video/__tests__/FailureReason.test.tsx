/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FailureReason from "../FailureReason";

const MESSAGE =
  "Video generation failed: the parameter resolution specified in the request is not valid for model doubao-seedance-2-0-mini in r2v. You were not charged.";

describe("FailureReason", () => {
  it("shows a clamped reason with no hover tooltip", () => {
    render(<FailureReason message={MESSAGE} />);
    const collapsed = screen.getByRole("button", { name: MESSAGE });
    expect(collapsed).not.toHaveAttribute("title");
    expect(collapsed).toHaveClass("line-clamp-3");
  });

  it("expands to selectable plain text on click, and collapses on Show less", () => {
    render(<FailureReason message={MESSAGE} />);
    fireEvent.click(screen.getByRole("button", { name: MESSAGE }));

    const full = screen.getByText(MESSAGE);
    expect(full.tagName).toBe("P");
    expect(full.closest("button, [role=button]")).toBeNull();
    expect(full).not.toHaveClass("line-clamp-3");

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getByRole("button", { name: MESSAGE })).toHaveClass("line-clamp-3");
  });

  it("expands from the keyboard", () => {
    render(<FailureReason message={MESSAGE} />);
    fireEvent.keyDown(screen.getByRole("button", { name: MESSAGE }), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });
});
