"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { TikTokIcon } from "@/components/ui/TikTokIcon";

interface TikTokEmbedProps {
  videoId: string;
  username: string;
}

/**
 * Click-to-load facade for TikTok embeds. Rendering all embed iframes at
 * once trips TikTok's "overload-protect" rate limiter and drags LCP; the
 * iframe is only created after the user asks for it.
 */
export default function TikTokEmbed({ videoId, username }: TikTokEmbedProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  if (isLoaded) {
    return (
      <iframe
        src={`https://www.tiktok.com/embed/v2/${videoId}?autoplay=1`}
        width="100%"
        height="100%"
        frameBorder="0"
        allow="encrypted-media; autoplay"
        allowFullScreen
        className="rounded-control"
        title={`TikTok video by ${username}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsLoaded(true)}
      aria-label={`Play TikTok video by ${username}`}
      className="group/embed relative flex h-full w-full flex-col items-center justify-center gap-4 rounded-control bg-gradient-to-b from-accent-soft to-surface-sunken transition-colors duration-fast hover:from-accent-soft hover:to-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="absolute right-3 top-3 text-ink-muted" aria-hidden>
        <TikTokIcon className="h-5 w-5" />
      </span>
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-raised transition-transform duration-fast ease-out-expo group-hover/embed:scale-110"
      >
        <Play className="ml-1 h-7 w-7 fill-current" />
      </span>
      <span className="text-sm font-medium text-ink">{username}</span>
      <span className="text-micro font-medium uppercase tracking-micro text-ink-muted">
        Tap to load video
      </span>
    </button>
  );
}
