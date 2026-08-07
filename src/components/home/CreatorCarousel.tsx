"use client";

import { useEffect, useRef, useState } from "react";
import TikTokEmbed from "@/components/home/TikTokEmbed";

export interface CarouselVideo {
  id: string;
  username: string;
  description: string;
}

interface CreatorCarouselProps {
  videos: CarouselVideo[];
  /** Marquee speed in pixels per second. */
  speed?: number;
}

const DEFAULT_SPEED_PX_S = 40;
const CARD_GAP_PX = 24;
const MOUNT_STAGGER_MS = 900;

/**
 * Continuously rolling TikTok marquee. Every embed mounts once (staggered, so
 * the burst doesn't trip TikTok's rate limiter) and is never unmounted or
 * reordered — cards wrap around via per-card translateX, so iframes never
 * reload. Motion runs on rAF outside React renders.
 */
export default function CreatorCarousel({
  videos,
  speed = DEFAULT_SPEED_PX_S,
}: CreatorCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const offsetRef = useRef(0);
  const inViewRef = useRef(false);
  const metricsRef = useRef({ slotW: 0, totalW: 0 });
  const [cardHeight, setCardHeight] = useState(0);
  const [mountedCount, setMountedCount] = useState(0);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      inViewRef.current = entry.isIntersecting;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Warm every embed right after page load (staggered, so the burst doesn't
  // trip TikTok's rate limiter); once mounted a card is never unmounted, so
  // players are already running by the time the section scrolls into view.
  useEffect(() => {
    if (mountedCount >= videos.length) return;
    const timer = setTimeout(
      () => setMountedCount((count) => count + 1),
      mountedCount === 0 ? 0 : MOUNT_STAGGER_MS
    );
    return () => clearTimeout(timer);
  }, [mountedCount, videos.length]);

  // Measure card slots from container width; cards are absolutely positioned.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const visible = width < 640 ? 1 : width < 1024 ? 2 : 3;
      const slotW = width / visible;
      metricsRef.current = { slotW, totalW: videos.length * slotW };
      setCardHeight(Math.round(((slotW - CARD_GAP_PX) * 16) / 9));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [videos.length]);

  // Marquee loop: wrap each card independently so the DOM never reorders.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const { slotW, totalW } = metricsRef.current;
      if (inViewRef.current && slotW > 0) {
        offsetRef.current = (offsetRef.current + (speed * (now - last)) / 1000) % totalW;
        cardRefs.current.forEach((card, index) => {
          if (!card) return;
          const x = ((((index * slotW - offsetRef.current) % totalW) + totalW) % totalW) - slotW;
          card.style.transform = `translateX(${x}px)`;
        });
      }
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [speed]);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="marquee"
      aria-label="Creator videos"
      className="reveal-up relative overflow-hidden"
      style={{ height: cardHeight || undefined }}
    >
      {videos.map((video, index) => (
        <figure
          key={video.id}
          ref={(el) => {
            cardRefs.current[index] = el;
          }}
          className="group absolute left-0 top-0 will-change-transform"
          style={{
            width: metricsRef.current.slotW
              ? metricsRef.current.slotW - CARD_GAP_PX
              : `calc(${100 / 3}% - ${CARD_GAP_PX}px)`,
            height: cardHeight || undefined,
            transform: "translateX(-200%)",
          }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-card border border-line bg-surface-sunken shadow-raised transition-shadow duration-fast hover:shadow-glow">
            <TikTokEmbed
              videoId={video.id}
              username={video.username}
              active={index < mountedCount}
            />
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-12 text-left">
              <p className="text-sm font-semibold text-white">{video.username}</p>
              <p className="mt-0.5 text-xs text-white/70">{video.description}</p>
            </figcaption>
          </div>
        </figure>
      ))}

      {/* Edge fades so cards dissolve instead of clipping hard */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface to-transparent"
      />
    </div>
  );
}
