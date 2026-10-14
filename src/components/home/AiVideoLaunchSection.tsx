"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SAMPLE_VIDEOS, type SampleVideo } from "@/lib/ai-video-samples";

type Lang = "en" | "zh";

const COPY = {
  badge: { en: "New Feature", zh: "全新功能" },
  title: { en: "AI Video", zh: "AI 视频生成" },
  tagline: {
    en: "Upgrade your video creation with the latest model — up to 1080p and 30 seconds long.",
    zh: "最新模型，升级你的视频创作体验：最高 1080p，长达 30 秒。",
  },
  subtitle: {
    en: "Turn a prompt or image into a video, and post it straight to TikTok.",
    zh: "输入一段描述或一张图片即可生成视频，一键发布到 TikTok。",
  },
  caption: { en: "Sample video", zh: "示例视频" },
  cta: { en: "Try AI Video", zh: "立即体验 AI 视频" },
} as const;

interface AiVideoLaunchSectionProps {
  lang?: Lang;
  sample?: SampleVideo;
}

export default function AiVideoLaunchSection({
  lang = "en",
  sample = SAMPLE_VIDEOS[0],
}: AiVideoLaunchSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Autoplay (muted, as browsers require) only while the player is on screen, so
  // the clip isn't downloaded until the visitor scrolls to it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReduceMotion(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Rejected when the browser blocks autoplay; the visitor can still press play.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  if (!sample) return null;

  return (
    <section
      aria-labelledby="ai-video-launch-heading"
      className="bg-gradient-feature py-[--space-section]"
    >
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-4 py-1.5 text-micro font-bold uppercase tracking-micro text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {COPY.badge[lang]}
        </span>
        <h2
          id="ai-video-launch-heading"
          className="mt-6 font-display text-h1 font-semibold text-ink"
        >
          {COPY.title[lang]}
        </h2>
        <p className="mx-auto mt-6 max-w-3xl text-2xl font-semibold leading-snug text-ink">
          {COPY.tagline[lang]}
        </p>
        <p className="mx-auto mt-4 max-w-3xl text-xl leading-[--leading-body] text-ink-muted">
          {COPY.subtitle[lang]}
        </p>

        {/* Sized from the sample's own frame: 16:9 fills max-w-5xl, portrait clips stay narrower. */}
        <div
          className="mx-auto mt-16 overflow-hidden rounded-card bg-black shadow-overlay"
          style={{
            aspectRatio: `${sample.width} / ${sample.height}`,
            width: `min(100%, calc(36rem * ${sample.width} / ${sample.height}))`,
          }}
        >
          <video
            ref={videoRef}
            // With autoplay off, the #t fragment paints the first frame as a poster.
            src={reduceMotion ? `${sample.url}#t=0.1` : sample.url}
            controls
            muted
            loop
            playsInline
            preload={reduceMotion ? "metadata" : "none"}
            aria-label={`${COPY.caption[lang]}: ${sample.title}`}
            className="h-full w-full object-contain"
          />
        </div>
        {/* <p className="mt-4 text-sm text-ink-muted">{COPY.caption[lang]}</p> */}

        <Link
          href="/creatorportal/ai-video"
          className="group mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-contrast shadow-raised transition-colors duration-fast hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {COPY.cta[lang]}
          <ArrowRight className="h-5 w-5 transition-transform duration-fast group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
