"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Download,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { VIDEO_LIFETIME_DAYS } from "./lifetime";
import { DeleteDialog, PreviewModal, expiresFormatter, generatedFormatter } from "./LibraryDialogs";
import SampleVideos from "./SampleVideos";
import { AiVideoRecord, TikTokBindingInfo } from "./types";

interface DashboardProps {
  videos: AiVideoRecord[];
  tikTokBinding: TikTokBindingInfo | null;
}

type LibraryFilter = "All" | "Ready" | "Expired";

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
  onToggleSelect: (videoId: string) => void;
  onPreview: (video: AiVideoRecord) => void;
};

// Label that slides in beside an icon-only control on hover or keyboard focus.
const HOVER_LABEL =
  "pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100";

function VideoTile({ video, selected, onToggleSelect, onPreview }: VideoTileProps) {
  const ready = video.status === "ready";
  const playable = ready && Boolean(video.videoUrl);
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

        {/* The whole frame plays the video; the controls below sit on top of it. */}
        {playable && (
          <button
            type="button"
            aria-label={`Play ${video.name}`}
            onClick={() => onPreview(video)}
            className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-400"
          />
        )}

        {!ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-900/60">
            <span className="rounded-full bg-white/90 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-700">
              Expired
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
              9:16
            </span>
            <label
              className={`group/tip pointer-events-auto relative grid h-7 w-7 cursor-pointer place-items-center rounded-full text-white transition ${
                selected ? "bg-indigo-500" : "bg-black/40 hover:bg-black/60"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                aria-label="Select video"
                checked={selected}
                onChange={() => onToggleSelect(video.id)}
              />
              {selected ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              )}
              <span className={HOVER_LABEL}>{selected ? "Selected" : "Select"}</span>
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
            {playable ? (
              <a
                href={`/api/ai-videos/library/${video.id}/download`}
                aria-label="Download video"
                className="group/tip pointer-events-auto relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-900 shadow-md transition hover:scale-105"
              >
                <Download className="h-4 w-4" />
                <span className={HOVER_LABEL}>Download</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <p className="truncate px-3 pt-2.5 text-sm font-semibold text-slate-900" title={video.name}>
        {video.name}
      </p>
      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1 text-xs">
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

export default function AiVideoDashboard({ videos: loadedVideos, tikTokBinding }: DashboardProps) {
  const router = useRouter();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Names changed in this visit, shown at once without re-fetching (and re-signing) the library.
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [isRedirectingToTikTok, setIsRedirectingToTikTok] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("All");

  const videos = useMemo(
    () =>
      loadedVideos.map((video) =>
        renamed[video.id] ? { ...video, name: renamed[video.id] } : video
      ),
    [loadedVideos, renamed]
  );
  const preview = videos.find((video) => video.id === previewId) ?? null;
  const deleting = videos.find((video) => video.id === deletingId) ?? null;
  const selectedVideo = videos.find((video) => selectedVideoIds.includes(video.id)) ?? null;

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
  const postActive = hasTikTokBinding && selectedVideoIds.length > 0;

  const selectedIsReady = selectedVideo ? readyVideoIds.includes(selectedVideo.id) : false;

  const handleDeleted = () => {
    setDeletingId(null);
    setPreviewId(null);
    clearSelection();
    router.refresh();
  };

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
    <div className="mx-auto max-w-[1200px] space-y-3">
      {/* ActionCards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/creatorportal/ai-video/generate"
          className="group relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-left text-white shadow-sm transition hover:shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
              Step 01
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold">Generate AI video</p>
          <p className="mt-1 text-sm text-white/80">
            Drop a script, voice or reference image. We mint a ready-to-post 9:16 clip.
          </p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold">
            New brief <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>

        <button
          type="button"
          onClick={scrollToLibrary}
          className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-200 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Video className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Step 02
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-900">Browse my videos</p>
          <p className="mt-1 text-sm text-slate-600">
            {counts.ready} ready · {counts.expired} expired. Preview or select to post.
          </p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-indigo-700">
            Open library <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>

        {/* The whole card is one action; "Switch account" sits on top of it. */}
        <div
          className={`group relative flex flex-col rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 p-5 text-left text-white shadow-sm transition ${
            postActive || !hasTikTokBinding ? "hover:shadow-lg" : ""
          }`}
        >
          <button
            type="button"
            aria-label={hasTikTokBinding ? "Post to TikTok" : "Connect TikTok"}
            onClick={hasTikTokBinding ? handlePost : redirectToTikTokAuth}
            disabled={hasTikTokBinding ? selectedVideoIds.length === 0 : isRedirectingToTikTok}
            className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed"
          />
          <div className="pointer-events-none relative flex flex-1 flex-col">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <Upload className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
                Step 03
              </span>
            </div>
            <p className="mt-2 text-lg font-semibold">Post to TikTok</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              {hasTikTokBinding ? (
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-emerald-300">
                  <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate">
                    Connected
                    {tikTokName ? (
                      <>
                        {" "}
                        as <span className="text-white">{tikTokName}</span>
                      </>
                    ) : null}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  Not connected
                </p>
              )}
              {hasTikTokBinding && (
                <button
                  type="button"
                  onClick={redirectToTikTokAuth}
                  disabled={isRedirectingToTikTok}
                  className="pointer-events-auto shrink-0 text-xs font-semibold text-white/70 hover:text-white disabled:opacity-50"
                >
                  {isRedirectingToTikTok ? "Redirecting…" : "Switch account"}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-white/80">
              {selectedVideoIds.length > 0
                ? `${selectedVideoIds.length} video${selectedVideoIds.length > 1 ? "s" : ""} selected — review captions & post.`
                : "Pick a ready video from your library, then send it straight to TikTok."}
            </p>
            <span
              className={`mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold ${
                postActive || !hasTikTokBinding ? "text-white" : "text-white/50"
              }`}
            >
              {hasTikTokBinding
                ? "Continue"
                : isRedirectingToTikTok
                  ? "Redirecting…"
                  : "Connect TikTok first"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>

      <SampleVideos />

      {/* VideoLibrary */}
      <section id="library" className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">My videos</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {counts.ready} ready · {counts.expired} expired ·{" "}
              <span className="ml-1 font-mono text-slate-400">
                downloads expire {VIDEO_LIFETIME_DAYS} days after generation
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

        {/* SelectionBar: actions for the selected video, between the header and the grid. */}
        {selectedVideo && (
          <div
            role="toolbar"
            aria-label="Selected video"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-100 bg-indigo-50/50 px-5 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              <p className="min-w-0 truncate text-sm text-slate-600">
                <span className="font-semibold text-slate-900">1 video selected</span> ·{" "}
                {selectedVideo.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Clear
              </button>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => setDeletingId(selectedVideo.id)}
                className="group/tip relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-rose-300 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100">
                  Delete
                </span>
              </button>
              {selectedIsReady && (
                // A plain link: the route redirects to a short-lived signed URL that the
                // browser saves as a file, so no client-side fetching is needed.
                <a
                  href={`/api/ai-videos/library/${selectedVideo.id}/download`}
                  aria-label="Download"
                  className="group/tip relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <Download className="h-4 w-4" />
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100">
                    Download
                  </span>
                </a>
              )}
              <button
                type="button"
                onClick={handlePost}
                disabled={!hasTikTokBinding || !selectedIsReady}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                <Upload className="h-4 w-4" />
                Post to TikTok
              </button>
            </div>
          </div>
        )}

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
            {visibleVideos.map((video) => (
              <VideoTile
                key={video.id}
                video={video}
                selected={selectedVideoIds.includes(video.id)}
                onToggleSelect={toggleSelect}
                onPreview={(record) => {
                  if (record.videoUrl) setPreviewId(record.id);
                }}
              />
            ))}
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

      {preview && preview.videoUrl && (
        <PreviewModal
          video={preview}
          onRenamed={(name) => setRenamed((current) => ({ ...current, [preview.id]: name }))}
          onClose={() => setPreviewId(null)}
        />
      )}
      {deleting && (
        <DeleteDialog
          video={deleting}
          onDeleted={handleDeleted}
          onClose={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
