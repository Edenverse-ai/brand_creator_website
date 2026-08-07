"use client";

import { TikTokIcon } from "@/components/ui/TikTokIcon";

interface TikTokEmbedProps {
  videoId: string;
  username: string;
  /**
   * When true the embed mounts and autoplays (muted, looping) via TikTok's
   * player/v1. When false a silent shimmer skeleton renders instead — the
   * carousel staggers activation so the mount burst doesn't trip TikTok's
   * "overload-protect" rate limiter.
   */
  active?: boolean;
}

const PLAYER_PARAMS =
  "autoplay=1&loop=1&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=0&timestamp=0&music_info=0&description=0&rel=0&native_context_menu=0";

export default function TikTokEmbed({ videoId, username, active = false }: TikTokEmbedProps) {
  if (active) {
    return (
      <iframe
        src={`https://www.tiktok.com/player/v1/${videoId}?${PLAYER_PARAMS}`}
        width="100%"
        height="100%"
        frameBorder="0"
        allow="encrypted-media; autoplay; fullscreen"
        className="h-full w-full"
        title={`TikTok video by ${username}`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-accent-soft to-surface-sunken"
    >
      <span className="text-ink-muted/40">
        <TikTokIcon className="h-8 w-8" />
      </span>
      <span className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <style jsx>{`
        .shimmer {
          animation: embed-shimmer 1.6s ease-in-out infinite;
        }
        @keyframes embed-shimmer {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
