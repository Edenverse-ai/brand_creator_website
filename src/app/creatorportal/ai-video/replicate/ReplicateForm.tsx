"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Clapperboard,
  Film,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { replicateSourceCeiling } from "@/lib/ai-video-entitlements";
import {
  PORTRAIT_MIME_TO_EXT,
  PRODUCT_IMAGES_MAX,
  REFERENCE_VIDEO_MIME_TO_EXT,
  STATUS_DISPLAY,
  type PortraitMime,
  type ReferenceVideoMime,
} from "@/lib/ai-video-task";
import type { ReplicateSample } from "@/lib/ai-video-samples";
import {
  DEFAULT_REPLICATE_MODE,
  replicateLimitsFor,
  type ReplicateMode,
  type VideoModel,
} from "@/lib/seedance/models";
import {
  PRODUCT_NAME_MAX,
  SELLING_POINTS_MAX,
  SOURCE_DURATION_TOLERANCE_SEC,
  expectedOutputSeconds,
  TARGET_AUDIENCE_MAX,
} from "@/lib/seedance/replicate";
import type { Resolution } from "@/lib/seedance/schema";
import { AudioPill, ModelPicker, ResolutionPicker } from "../generate/GenerationControls";
import {
  putFile,
  requestUploadUrl,
  validateImage,
  validateReferenceVideo,
  type UploadKind,
} from "../uploads";
import { GENERIC_FAILURE, formatElapsed, useTaskPoll, type TaskOutcome } from "../useTaskPoll";
import FailureReason from "../FailureReason";
import type { ReplicateHistoryItem } from "./types";

const CARD = "rounded-2xl border border-slate-100 bg-white p-5 shadow-sm";
const LABEL = "text-sm font-semibold text-slate-800";
const INPUT =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2 text-sm text-slate-700 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100";
const DROP_ZONE =
  "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition";

type SourceVideo = { file: File; durationSec: number; previewUrl: string };
type ProductImage = { id: string; file: File; previewUrl: string };
type Tab = "history" | "example";

type TaskResponse = { id: string; status: string; errorMessage: string | null };

function isInFlight(item: ReplicateHistoryItem): boolean {
  return item.status === "QUEUED" || item.status === "GENERATING";
}

export default function ReplicateForm({
  initialRemaining,
  limit,
  maxSourceSec,
  isMock,
  models,
  initialHistory,
  sample,
}: {
  /** null = unlimited. */
  initialRemaining: number | null;
  limit: number | null;
  /** The creator's source-length ceiling before the model's own limit. */
  maxSourceSec: number;
  isMock: boolean;
  models: readonly (VideoModel & { mode: ReplicateMode })[];
  initialHistory: ReplicateHistoryItem[];
  sample: ReplicateSample | null;
}) {
  const [video, setVideo] = useState<SourceVideo | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductImage[]>([]);
  const [productError, setProductError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [mode, setMode] = useState<ReplicateMode>(DEFAULT_REPLICATE_MODE);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [tab, setTab] = useState<Tab>(initialHistory.length > 0 || !sample ? "history" : "example");
  const videoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const limits = replicateLimitsFor(mode);
  const ceiling = replicateSourceCeiling(maxSourceSec, mode);
  const videoTooLong =
    video !== null && video.durationSec > ceiling + SOURCE_DURATION_TOLERANCE_SEC;
  const outOfReplicates = remaining !== null && remaining <= 0;
  const canSubmit =
    !submitting &&
    !outOfReplicates &&
    video !== null &&
    !videoTooLong &&
    products.length > 0 &&
    productName.trim().length > 0;

  // Object URLs live as long as their preview; release them when replaced or unmounted.
  const videoPreviewUrl = video?.previewUrl;
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);
  const productsRef = useRef(products);
  productsRef.current = products;
  useEffect(
    () => () => productsRef.current.forEach((product) => URL.revokeObjectURL(product.previewUrl)),
    []
  );

  const changeMode = (next: ReplicateMode) => {
    const nextLimits = replicateLimitsFor(next);
    setMode(next);
    if (!nextLimits.resolutions.includes(resolution)) setResolution(nextLimits.resolutions[0]);
  };

  const pickVideo = async (file: File) => {
    const check = await validateReferenceVideo(file, ceiling);
    if (!check.ok) {
      setVideoError(check.problem);
      return;
    }
    setVideoError(null);
    setVideo({ file, durationSec: check.durationSec, previewUrl: URL.createObjectURL(file) });
  };

  const clearVideo = () => {
    setVideo(null);
    setVideoError(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const addProducts = useCallback(async (files: File[]) => {
    const room = PRODUCT_IMAGES_MAX - productsRef.current.length;
    if (room <= 0) {
      setProductError(`Up to ${PRODUCT_IMAGES_MAX} images.`);
      return;
    }
    const accepted: ProductImage[] = [];
    let problem: string | null = files.length > room ? `Up to ${PRODUCT_IMAGES_MAX} images.` : null;
    for (const file of files.slice(0, room)) {
      const issue = await validateImage(file);
      if (issue) {
        problem = issue;
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setProductError(problem);
    if (accepted.length) setProducts((current) => [...current, ...accepted]);
  }, []);

  const removeProduct = (id: string) => {
    setProducts((current) => {
      const removed = current.find((product) => product.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((product) => product.id !== id);
    });
    setProductError(null);
  };

  // Pasting an image anywhere on the page adds it as a product image.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (submitting) return;
      const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (images.length === 0) return;
      event.preventDefault();
      void addProducts(images);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addProducts, submitting]);

  const onVideoInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void pickVideo(file);
  };
  const onProductInput = (event: ChangeEvent<HTMLInputElement>) => {
    void addProducts(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  const allowDrop = (event: DragEvent) => event.preventDefault();
  const onVideoDrop = (event: DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && !submitting) void pickVideo(file);
  };
  const onProductDrop = (event: DragEvent) => {
    event.preventDefault();
    if (!submitting) void addProducts(Array.from(event.dataTransfer.files ?? []));
  };

  const settleHistoryItem = useCallback((id: string, outcome: TaskOutcome) => {
    setHistory((items) =>
      items.map((item) =>
        item.id !== id
          ? item
          : outcome.status === "DELIVERED"
            ? { ...item, status: "DELIVERED", videoUrl: outcome.videoUrl }
            : { ...item, status: "FAILED", errorMessage: outcome.message }
      )
    );
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!video) {
      setFormError("Upload the trending video you want to replicate.");
      return;
    }
    if (products.length === 0) {
      setFormError("Add at least one photo of your product.");
      return;
    }
    if (!productName.trim()) {
      setFormError("Enter your product's name.");
      return;
    }
    if (!canSubmit) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const videoUpload = await requestUploadUrl(
        "reference_video",
        REFERENCE_VIDEO_MIME_TO_EXT[video.file.type as ReferenceVideoMime]
      );
      const { taskId } = videoUpload;
      const productUploads = await Promise.all(
        products.map((product, index) =>
          requestUploadUrl(
            `product_${index + 1}` as UploadKind,
            PORTRAIT_MIME_TO_EXT[product.file.type as PortraitMime],
            taskId
          )
        )
      );
      await Promise.all([
        putFile(videoUpload.uploadUrl, video.file),
        ...productUploads.map((upload, index) => putFile(upload.uploadUrl, products[index].file)),
      ]);

      const response = await fetch("/api/ai-videos/replicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          reference_video_path: videoUpload.path,
          product_image_paths: productUploads.map((upload) => upload.path),
          input: {
            productName,
            targetAudience,
            sellingPoints,
            referenceDurationSec: video.durationSec,
            mode,
            resolution,
            generateAudio,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        setRemaining(0);
        throw new Error(data.error || "You've reached today's trend replicate limit.");
      }
      if (!response.ok) {
        throw new Error(data.error || "We couldn't start this video. Please try again.");
      }

      const task = data as TaskResponse;
      const failed = task.status === "FAILED";
      if (!failed) setRemaining((value) => (value === null ? null : Math.max(0, value - 1)));
      setHistory((items) => [
        {
          id: task.id,
          status: failed ? "FAILED" : "GENERATING",
          productName: productName.trim(),
          errorMessage: failed ? (task.errorMessage ?? GENERIC_FAILURE) : null,
          // A fresh object URL: the form's own previews are revoked when edited.
          thumbnailUrl: URL.createObjectURL(products[0].file),
          videoUrl: null,
          createdAt: new Date().toISOString(),
        },
        ...items.filter((item) => item.id !== task.id),
      ]);
      setTab("history");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {isMock && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Mock mode — no video credits used.</span> Replicates
            return a sample clip after about 10 seconds.
          </p>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <form className="min-w-0 space-y-3" onSubmit={handleSubmit} noValidate>
          <fieldset disabled={submitting} className={`${CARD} min-w-0 space-y-4`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="min-w-0">
                <h2 className={LABEL}>
                  Original video <span className="font-normal text-slate-400">(required)</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  MP4 or MOV · 2–{ceiling} s · up to 50 MB
                </p>
                {video ? (
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                    <video
                      src={video.previewUrl}
                      muted
                      playsInline
                      controls
                      className="h-20 w-14 shrink-0 rounded-lg bg-slate-900 object-cover"
                      aria-label="Original video preview"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {video.file.name}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                        {video.durationSec.toFixed(1)} s
                      </p>
                      {videoTooLong && (
                        <p className="mt-0.5 text-xs font-medium text-rose-600">
                          This model replicates videos up to {ceiling} seconds. Pick another model
                          or a shorter video.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearVideo}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                      aria-label="Remove original video"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="original-video"
                    onDragOver={allowDrop}
                    onDrop={onVideoDrop}
                    className={`${DROP_ZONE} mt-2 h-24 border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:bg-indigo-50`}
                  >
                    <Film className="h-6 w-6 text-indigo-500" />
                    <span className="mt-1.5 text-sm font-semibold text-indigo-700">
                      Upload original video
                    </span>
                    <span className="text-xs text-slate-500">Click or drag a file here</span>
                  </label>
                )}
                <input
                  id="original-video"
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="hidden"
                  ref={videoInputRef}
                  onChange={onVideoInput}
                />
                {videoError && (
                  <p className="mt-1.5 text-xs font-medium text-rose-600">{videoError}</p>
                )}
              </section>

              <section className="min-w-0">
                <h2 className={LABEL}>
                  Product images <span className="font-normal text-slate-400">(required)</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Up to {PRODUCT_IMAGES_MAX} · click, drag or paste
                </p>
                <div
                  className="mt-2 flex flex-wrap gap-2"
                  onDragOver={allowDrop}
                  onDrop={onProductDrop}
                >
                  {products.map((product, index) => (
                    <div
                      key={product.id}
                      className="relative h-20 w-20 overflow-hidden rounded-xl bg-slate-100"
                    >
                      <Image
                        src={product.previewUrl}
                        alt={`Product image ${index + 1}`}
                        fill
                        unoptimized
                        sizes="80px"
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeProduct(product.id)}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        aria-label={`Remove product image ${index + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {products.length < PRODUCT_IMAGES_MAX && (
                    <label
                      htmlFor="product-images"
                      className={`${DROP_ZONE} h-20 w-20 border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:bg-indigo-50`}
                    >
                      {products.length === 0 ? (
                        <ImagePlus className="h-6 w-6 text-indigo-500" />
                      ) : (
                        <Plus className="h-6 w-6 text-indigo-500" />
                      )}
                      <span className="mt-1.5 text-[11px] font-semibold text-indigo-700">
                        Add image
                      </span>
                    </label>
                  )}
                </div>
                <input
                  id="product-images"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  ref={productInputRef}
                  onChange={onProductInput}
                />
                {productError && (
                  <p className="mt-1.5 text-xs font-medium text-rose-600">{productError}</p>
                )}
              </section>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <section>
                <label htmlFor="product-name" className={LABEL}>
                  Product name <span className="font-normal text-slate-400">(required)</span>
                </label>
                <input
                  id="product-name"
                  type="text"
                  maxLength={PRODUCT_NAME_MAX}
                  placeholder="e.g. Ivory Mini Top-Handle Bag"
                  className={INPUT}
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                />
              </section>

              <section>
                <label htmlFor="target-audience" className={LABEL}>
                  Target audience
                </label>
                <input
                  id="target-audience"
                  type="text"
                  maxLength={TARGET_AUDIENCE_MAX}
                  placeholder="e.g. women 25-35"
                  className={INPUT}
                  value={targetAudience}
                  onChange={(event) => setTargetAudience(event.target.value)}
                />
              </section>
            </div>

            <section>
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="selling-points" className={LABEL}>
                  Selling points
                </label>
                <span className="text-xs tabular-nums text-slate-400">
                  {sellingPoints.length}/{SELLING_POINTS_MAX}
                </span>
              </div>
              <textarea
                id="selling-points"
                rows={2}
                maxLength={SELLING_POINTS_MAX}
                placeholder="e.g. soft vegan leather, gold clasp, fits a phone and wallet"
                className={`${INPUT} resize-none`}
                value={sellingPoints}
                onChange={(event) => setSellingPoints(event.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                List as many as you like — the video uses the strongest ones.
              </p>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <ModelPicker models={models} value={mode} onChange={changeMode} />
              <ResolutionPicker
                value={resolution}
                resolutions={limits.resolutions}
                onChange={setResolution}
              />
              <AudioPill value={generateAudio} onChange={setGenerateAudio} />
            </div>
          </fieldset>

          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              {remaining === null ? (
                <p className="font-semibold text-slate-900">Unlimited replicates</p>
              ) : (
                <p>
                  <span className="font-semibold text-slate-900">
                    {remaining} free replicate{remaining === 1 ? "" : "s"} left this month
                  </span>{" "}
                  <span className="text-slate-400">of {limit}</span>
                </p>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                {video && !videoTooLong
                  ? `Output ≈ ${expectedOutputSeconds(video.durationSec, ceiling)} s · `
                  : ""}
                Generation can&apos;t be cancelled once started.
              </p>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="group relative inline-flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <span className="relative inline-flex items-center gap-2">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {submitting ? "Uploading…" : "Replicate video"}
              </span>
            </button>
          </div>
        </form>

        <aside className={`${CARD} h-fit lg:sticky lg:top-6`}>
          <div
            role="tablist"
            aria-label="Replicate results"
            className="inline-flex gap-1 rounded-xl bg-slate-100 p-1"
          >
            {(["history", "example"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                  tab === id
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {id === "history" ? "History" : "Example"}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="mt-4">
            {tab === "history" ? (
              <HistoryList items={history} onSettled={settleHistoryItem} />
            ) : (
              <ExamplePanel sample={sample} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** History shows the latest two; the full list lives on the tasks page. */
const HISTORY_PREVIEW = 2;

function HistoryList({
  items,
  onSettled,
}: {
  items: ReplicateHistoryItem[];
  onSettled: (id: string, outcome: TaskOutcome) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 p-8 text-center">
        <Clapperboard className="h-7 w-7 text-slate-400" />
        <p className="text-sm text-slate-500">Your replicated videos will appear here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.slice(0, HISTORY_PREVIEW).map((item, index) => (
          <HistoryRow key={item.id} item={item} expanded={index === 0} onSettled={onSettled} />
        ))}
      </ul>
      <Link
        href="/creatorportal/ai-video/tasks"
        className="block text-center text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        View all generation tasks →
      </Link>
    </div>
  );
}

function HistoryRow({
  item,
  expanded,
  onSettled,
}: {
  item: ReplicateHistoryItem;
  /** The newest row opens its player; older ones open on demand. */
  expanded: boolean;
  onSettled: (id: string, outcome: TaskOutcome) => void;
}) {
  const inFlight = isInFlight(item);
  const elapsed = useTaskPoll(
    inFlight ? { taskId: item.id, startedAt: Date.parse(item.createdAt) } : null,
    (outcome) => onSettled(item.id, outcome)
  );
  const [showVideo, setShowVideo] = useState(expanded);
  const display = STATUS_DISPLAY[item.status];
  const delivered = item.status === "DELIVERED" && item.videoUrl;

  return (
    <li
      data-testid="replicate-history-item"
      className="min-w-0 rounded-xl border border-slate-100 p-2.5"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {item.thumbnailUrl && (
            <Image
              src={item.thumbnailUrl}
              alt=""
              fill
              unoptimized
              sizes="40px"
              className="object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800" title={item.productName}>
            {item.productName}
          </p>
          <p className="truncate text-xs text-slate-500">
            {inFlight
              ? `${formatElapsed(elapsed)} elapsed · usually a few minutes`
              : formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </p>
        </div>
        {delivered && !showVideo ? (
          <button
            type="button"
            onClick={() => setShowVideo(true)}
            className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline"
          >
            Watch
          </button>
        ) : (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${display.className}`}
          >
            {inFlight && <Loader2 className="h-3 w-3 animate-spin" />}
            {display.label}
          </span>
        )}
      </div>
      {item.status === "FAILED" && item.errorMessage && (
        <FailureReason message={item.errorMessage} className="mt-2" />
      )}
      {delivered && showVideo && (
        <div className="mt-2 space-y-1.5">
          <video
            src={item.videoUrl ?? undefined}
            controls
            playsInline
            className="mx-auto max-h-72 w-full rounded-lg bg-slate-900 object-contain"
          />
          <Link
            href="/creatorportal/ai-video"
            className="inline-block text-xs font-semibold text-indigo-600 underline-offset-2 hover:underline"
          >
            Post it to TikTok from My Videos →
          </Link>
        </div>
      )}
    </li>
  );
}

function ExamplePanel({ sample }: { sample: ReplicateSample | null }) {
  if (!sample) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 p-10 text-center">
        <Film className="h-8 w-8 text-slate-400" />
        <p className="text-sm text-slate-500">An example replicate is coming soon.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-4">
        <figure>
          <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Trending video
          </figcaption>
          <video
            src={`${sample.originalUrl}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            className="mt-2 w-full rounded-lg bg-slate-900"
          />
        </figure>
        <figure>
          <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Product · {sample.productName}
          </figcaption>
          <div className="mt-2 flex gap-2">
            {sample.productImageUrls.map((url, index) => (
              <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100">
                <Image
                  src={url}
                  alt={`Example product image ${index + 1}`}
                  fill
                  unoptimized
                  sizes="64px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </figure>
      </div>
      <figure>
        <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Result
        </figcaption>
        <video
          src={`${sample.resultUrl}#t=0.1`}
          controls
          playsInline
          preload="metadata"
          className="mt-2 w-full rounded-lg bg-slate-900"
        />
      </figure>
    </div>
  );
}
