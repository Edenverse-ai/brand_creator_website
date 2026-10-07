"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Download,
  Info,
  Pause,
  Play,
  Plus,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import { AiVideoRecord, TikTokBindingInfo, VideoStatus } from "./types";

interface DashboardProps {
  videos: AiVideoRecord[];
  tikTokBinding: TikTokBindingInfo | null;
}

const generatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

const expiresFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

type LibraryFilter = "All" | "Ready" | "Expired";

function TikTokGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.5 2h-2.7v13.6a3.3 3.3 0 11-3.3-3.3c.24 0 .47.02.7.07V9.7a6 6 0 105.3 5.95V8.55a7.4 7.4 0 004.5 1.55V7.3a4.6 4.6 0 01-4.5-4.5V2z" />
    </svg>
  );
}

// Stable color palette per video id, used as a placeholder gradient when no thumbnail is available.
const palettes = [
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-500",
  "from-indigo-700 to-slate-900",
  "from-amber-400 to-rose-500",
  "from-sky-500 to-indigo-600",
  "from-fuchsia-500 to-purple-600",
];
function paletteFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

type VideoTileProps = {
  video: AiVideoRecord;
  selected: boolean;
  canSelect: boolean;
  onToggleSelect: (videoId: string) => void;
  onPreview: (video: AiVideoRecord) => void;
};

function VideoTile({ video, selected, canSelect, onToggleSelect, onPreview }: VideoTileProps) {
  const ready = video.status === "ready";
  const expiresLabel = ready ? expiresFormatter.format(new Date(video.expiresAt)) : "expired";

  return (
    <article
      className={`group overflow-hidden rounded-2xl border bg-white transition ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-200"
          : "border-slate-200 hover:border-slate-300"
      } ${!ready ? "opacity-70" : ""}`}
    >
      <div className={`relative aspect-[9/16] w-full bg-gradient-to-br ${paletteFor(video.id)}`}>
        {video.thumbnailUrl ? (
          // Thumbnails come from signed Supabase storage URLs whose host varies per env;
          // skip next/image to avoid an allow-list dependency for previews.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={`Thumbnail for video ${video.id}`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : video.videoUrl ? (
          // No stored thumbnail: show the video's own first frame. preload="metadata"
          // plus the #t fragment makes the browser fetch and paint just that frame.
          <video
            src={`${video.videoUrl}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            aria-hidden="true"
            data-testid="video-tile-frame"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        <div className="absolute inset-0 ph-dark mix-blend-overlay opacity-40" />

        <div className="absolute inset-0 flex flex-col justify-between p-3">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
              9:16
            </span>
            <label
              className={`grid h-7 w-7 cursor-pointer place-items-center rounded-full text-white transition ${
                selected ? "bg-indigo-500" : "bg-black/40 hover:bg-black/60"
              } ${!canSelect ? "pointer-events-none opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected}
                onChange={() => onToggleSelect(video.id)}
                disabled={!canSelect}
              />
              {selected ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              )}
            </label>
          </div>
          <div className="flex items-end justify-between">
            <div className="flex flex-wrap gap-1">
              {video.tags.slice(0, 3).map((t) => (
                <span
                  key={`${video.id}-${t}`}
                  className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/90"
                >
                  #{t}
                </span>
              ))}
            </div>
            {ready && video.videoUrl ? (
              <button
                type="button"
                aria-label="Preview"
                onClick={() => onPreview(video)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-900 shadow-md transition hover:scale-105"
              >
                <Play className="h-4 w-4" fill="currentColor" />
              </button>
            ) : null}
          </div>
        </div>

        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900/60">
            <span className="rounded-full bg-white/90 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-700">
              Expired
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
        <span className="flex items-center gap-1.5 text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          {generatedFormatter.format(new Date(video.generatedAt))}
        </span>
        <span className={`font-mono ${ready ? "text-slate-500" : "text-rose-500"}`}>
          {ready ? `expires ${expiresLabel}` : "expired"}
        </span>
      </div>
    </article>
  );
}

type PreviewModalProps = {
  video: AiVideoRecord;
  onClose: () => void;
};

const statusTokens: Record<VideoStatus, { label: string; tone: string }> = {
  ready: { label: "Ready to download", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  expired: { label: "Expired", tone: "bg-slate-100 text-slate-500 ring-slate-200" },
};

function PreviewModal({ video, onClose }: PreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const statusToken = statusTokens[video.status];

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => setIsPlaying(false));
  }, [video]);

  const togglePlayback = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/80" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Video tags</p>
            <div className="flex flex-wrap gap-2">
              {video.tags.length ? (
                video.tags.map((tag) => (
                  <span
                    key={`${video.id}-modal-tag-${tag}`}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500"
                  >
                    #{tag}
                  </span>
                ))
              ) : (
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                  Untagged
                </span>
              )}
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusToken.tone}`}
            >
              {statusToken.label}
            </span>
            <div className="text-sm text-slate-500">
              <p>Generated {generatedFormatter.format(new Date(video.generatedAt))}</p>
              <p>Download window ends {expiresFormatter.format(new Date(video.expiresAt))}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-900">
          <video
            ref={videoRef}
            src={video.videoUrl}
            playsInline
            className="aspect-[9/16] max-h-[65vh] w-full object-contain"
          />
          <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-900/80 px-4 py-3 text-white">
            <button
              onClick={togglePlayback}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-1 text-sm font-medium"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Play
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AiVideoDashboard({ videos, tikTokBinding }: DashboardProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<AiVideoRecord | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [isRedirectingToTikTok, setIsRedirectingToTikTok] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("All");

  const readyVideoIds = useMemo(
    () =>
      videos.filter((video) => video.status === "ready" && video.videoUrl).map((video) => video.id),
    [videos]
  );

  const counts = useMemo(() => {
    const ready = videos.filter((v) => v.status === "ready").length;
    return { total: videos.length, ready, expired: videos.length - ready };
  }, [videos]);

  const visibleVideos = useMemo(() => {
    if (filter === "Ready") return videos.filter((v) => v.status === "ready");
    if (filter === "Expired") return videos.filter((v) => v.status === "expired");
    return videos;
  }, [videos, filter]);

  const toggleSelect = (videoId: string) => {
    setSelectedVideoIds((prev) => (prev.includes(videoId) ? [] : [videoId]));
  };
  const clearSelection = () => setSelectedVideoIds([]);

  const hasTikTokBinding = Boolean(tikTokBinding);
  const tikTokName = tikTokBinding?.displayName || tikTokBinding?.handle || tikTokBinding?.openId;

  const handlePost = () => {
    const selectedReady = selectedVideoIds.filter((id) => readyVideoIds.includes(id));
    if (!selectedReady.length) return;
    const query = new URLSearchParams({ ids: selectedReady.join(",") });
    router.push(`/creatorportal/ai-video/post?${query.toString()}`);
  };

  const scrollToLibrary = () => {
    document.getElementById("library")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const redirectToTikTokAuth = () => {
    setIsRedirectingToTikTok(true);
    window.location.href = "/api/auth/tiktok/authorize";
  };

  const filters: LibraryFilter[] = ["All", "Ready", "Expired"];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 py-8">
      {/* PageHeader */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
            Creator workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">AI Video</h1>
          <p className="mt-1.5 max-w-xl text-sm text-slate-600">
            Three things live here: generate a clip, browse what you&apos;ve already made, send the
            best ones to TikTok.
          </p>
        </div>
        <Link
          href="/creatorportal/ai-video/learn-more"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
        >
          <Info className="h-3.5 w-3.5" />
          How AI video works
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* TikTokStatus */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white">
            <TikTokGlyph className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              TikTok account
            </p>
            {hasTikTokBinding ? (
              <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Connected
                {tikTokName ? (
                  <>
                    {" "}
                    as <span className="text-slate-900">{tikTokName}</span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                Not connected
              </p>
            )}
          </div>
        </div>
        {hasTikTokBinding ? (
          <button
            type="button"
            onClick={redirectToTikTokAuth}
            disabled={isRedirectingToTikTok}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
          >
            {isRedirectingToTikTok ? "Redirecting…" : "Switch account"}
          </button>
        ) : (
          <button
            type="button"
            onClick={redirectToTikTokAuth}
            disabled={isRedirectingToTikTok}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isRedirectingToTikTok ? "Redirecting…" : "Connect TikTok"}
          </button>
        )}
      </div>

      {/* ActionCards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/creatorportal/ai-video/generate"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-left text-white shadow-sm transition hover:shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
              Step 01
            </span>
          </div>
          <p className="mt-5 text-lg font-semibold">Generate AI video</p>
          <p className="mt-1 text-sm text-white/80">
            Drop a script, voice or reference image. We mint a ready-to-post 9:16 clip.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">
            New brief <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>

        <button
          type="button"
          onClick={scrollToLibrary}
          className="group relative rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-200 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Video className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Step 02
            </span>
          </div>
          <p className="mt-5 text-lg font-semibold text-slate-900">Browse my videos</p>
          <p className="mt-1 text-sm text-slate-600">
            {counts.ready} ready · {counts.expired} expired. Preview or select to post.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
            Open library <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={handlePost}
          disabled={!hasTikTokBinding || selectedVideoIds.length === 0}
          className={`group relative rounded-2xl border p-5 text-left transition ${
            selectedVideoIds.length > 0 && hasTikTokBinding
              ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              : "border-slate-200 bg-white text-slate-900"
          } disabled:cursor-not-allowed`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl ${
                selectedVideoIds.length > 0 && hasTikTokBinding
                  ? "bg-white/15 ring-1 ring-white/20"
                  : "bg-slate-900 text-white"
              }`}
            >
              <Upload className="h-5 w-5" />
            </span>
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
                selectedVideoIds.length > 0 && hasTikTokBinding ? "text-white/70" : "text-slate-400"
              }`}
            >
              Step 03
            </span>
          </div>
          <p className="mt-5 text-lg font-semibold">Post to TikTok</p>
          <p
            className={`mt-1 text-sm ${
              selectedVideoIds.length > 0 && hasTikTokBinding ? "text-white/80" : "text-slate-600"
            }`}
          >
            {selectedVideoIds.length > 0
              ? `${selectedVideoIds.length} video${selectedVideoIds.length > 1 ? "s" : ""} selected — review captions & post.`
              : "Pick a ready video from your library, then send it straight to TikTok."}
          </p>
          <span
            className={`mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${
              selectedVideoIds.length > 0 && hasTikTokBinding ? "text-white" : "text-slate-400"
            }`}
          >
            {hasTikTokBinding ? "Continue" : "Connect TikTok first"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>

      {/* VideoLibrary */}
      <section id="library" className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">My videos</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {counts.ready} ready · {counts.expired} expired ·{" "}
              <span className="ml-1 font-mono text-slate-400">
                downloads expire 7 days after generation
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f}
                {f === "All" ? ` · ${counts.total}` : ""}
              </button>
            ))}
          </div>
        </header>

        {videos.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No AI videos yet. Generate a new brief to see your clips here.
          </div>
        ) : visibleVideos.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No videos match this filter.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3 lg:grid-cols-4">
            {visibleVideos.map((video) => {
              const canSelect = video.status === "ready" && Boolean(video.videoUrl);
              return (
                <VideoTile
                  key={video.id}
                  video={video}
                  selected={selectedVideoIds.includes(video.id)}
                  canSelect={canSelect}
                  onToggleSelect={toggleSelect}
                  onPreview={(record) => {
                    if (record.videoUrl) setPreview(record);
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* LearnMoreLink */}
      <Link
        href="/creatorportal/ai-video/learn-more"
        className="group flex flex-col items-start justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 transition hover:border-indigo-300 hover:bg-white sm:flex-row sm:items-center"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Want to know more about generating your own AI videos?
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Sample reels, distribution channels, Creator Pack pricing and the full story.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-indigo-600">
          Learn more <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      {/* SelectionBar — sticky bottom action when a video is selected */}
      {selectedVideoIds.length > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white p-3 pl-5 shadow-lg shadow-slate-900/10">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-50 text-indigo-700">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {selectedVideoIds.length} video{selectedVideoIds.length > 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-slate-500">
                {hasTikTokBinding
                  ? "Download it, or review captions on the next screen."
                  : "Download it, or connect TikTok to enable posting."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Clear
            </button>
            {selectedVideoIds.map((videoId) => (
              // A plain link: the route redirects to a short-lived signed URL that the
              // browser saves as a file, so no client-side fetching is needed.
              <a
                key={videoId}
                href={`/api/ai-videos/library/${videoId}/download`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            ))}
            <button
              type="button"
              onClick={handlePost}
              disabled={!hasTikTokBinding}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              <Upload className="h-4 w-4" />
              Post to TikTok
            </button>
          </div>
        </div>
      )}

      {preview && preview.videoUrl && (
        <PreviewModal video={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
