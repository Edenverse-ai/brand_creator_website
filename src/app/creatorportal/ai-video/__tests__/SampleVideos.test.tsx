/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SampleVideos from "../SampleVideos";

const landscape = {
  id: "wide",
  title: "Wide",
  url: "https://example.com/wide.mp4",
  width: 16,
  height: 9,
};
const portrait = {
  id: "tall",
  title: "Tall",
  url: "https://example.com/tall.mp4",
  width: 9,
  height: 16,
};

describe("SampleVideos", () => {
  it("renders a click-to-play player that does not autoplay", () => {
    render(<SampleVideos samples={[landscape]} />);
    const video = screen.getByLabelText("Sample video: Wide");
    expect(video).toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("src", "https://example.com/wide.mp4#t=0.1");
  });

  it("sizes each slot from the sample's own frame", () => {
    render(<SampleVideos samples={[landscape, portrait]} />);
    const [wide, tall] = screen.getAllByTestId("sample-video");
    expect(wide.style.aspectRatio).toBe("16 / 9");
    expect(tall.style.aspectRatio).toBe("9 / 16");
  });

  it("renders nothing without samples", () => {
    const { container } = render(<SampleVideos samples={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
