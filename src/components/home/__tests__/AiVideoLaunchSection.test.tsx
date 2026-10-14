/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import AiVideoLaunchSection from "@/components/home/AiVideoLaunchSection";

const sample = {
  id: "wide",
  title: "Wide",
  url: "https://example.com/wide.mp4",
  width: 16,
  height: 9,
};

let observerCallback: IntersectionObserverCallback;
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

function scrollIntoView(isIntersecting: boolean) {
  act(() => {
    observerCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn(function (callback: IntersectionObserverCallback) {
      observerCallback = callback;
      return { observe: vi.fn(), disconnect: vi.fn() };
    })
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  play.mockClear();
  pause.mockClear();
});

describe("AiVideoLaunchSection", () => {
  it("renders a muted, looping player that plays only while on screen", () => {
    render(<AiVideoLaunchSection sample={sample} />);
    const video = screen.getByLabelText("Sample video: Wide") as HTMLVideoElement;
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("loop");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("preload", "none");

    scrollIntoView(true);
    expect(play).toHaveBeenCalledTimes(1);
    scrollIntoView(false);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("links to the AI Video page", () => {
    render(<AiVideoLaunchSection sample={sample} />);
    expect(screen.getByRole("link", { name: /Try AI Video/ })).toHaveAttribute(
      "href",
      "/creatorportal/ai-video"
    );
  });

  it("shows the Chinese copy", () => {
    render(<AiVideoLaunchSection lang="zh" sample={sample} />);
    expect(screen.getByRole("heading", { name: "AI 视频生成" })).toBeInTheDocument();
    expect(screen.getByText(/最高 1080p，长达 30 秒/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /立即体验 AI 视频/ })).toBeInTheDocument();
  });

  it("does not autoplay when the visitor prefers reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList
    );
    render(<AiVideoLaunchSection sample={sample} />);
    const video = screen.getByLabelText("Sample video: Wide");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("src", "https://example.com/wide.mp4#t=0.1");
    expect(IntersectionObserver).not.toHaveBeenCalled();
  });
});
