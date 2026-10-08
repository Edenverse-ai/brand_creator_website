"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Clapperboard,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { PORTRAIT_MAX_BYTES, PORTRAIT_MIME_TO_EXT, type PortraitMime } from "@/lib/ai-video-task";
import { DEFAULT_MODE, limitsFor, type VideoMode, type VideoModel } from "@/lib/seedance/models";
import type { Ratio } from "@/lib/seedance/schema";
import { FormatFields, FormatPopover, ModelPicker, type FormatValue } from "./GenerationControls";

const PROMPT_MAX = 5000;
const POLL_INTERVAL_MS = 10_000;
// Provider limits for reference images (AI Open Platform video API v1.1).
const IMAGE_MIN_SIDE = 300;
const IMAGE_MAX_SIDE = 6000;
const IMAGE_MIN_ASPECT = 0.4;
const IMAGE_MAX_ASPECT = 2.5;
const GENERIC_FAILURE = "Video generation failed. You were not charged — please try again.";

const PROMPT_PLACEHOLDER =
  'Describe the subject, action, scene, style, camera movement and sound. Example: A barista slides a latte across a sunlit counter, slow push-in, warm film look. She smiles and says "Your usual."';

// Below lg each section is its own card; from lg up they share one composer card.
const CARD_BELOW_LG =
  "max-lg:rounded-2xl max-lg:border max-lg:border-slate-100 max-lg:bg-white max-lg:p-6 max-lg:shadow-sm";

const RATIO_ASPECT: Record<Ratio, string> = {
  "9:16": "9 / 16",
  "16:9": "16 / 9",
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "4:3": "4 / 3",
};

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "generating"; taskId: string; startedAt: number }
  | { kind: "delivered"; videoUrl: string | null }
  | { kind: "failed"; message: string };

type TaskResponse = {
  id: string;
  status: string;
  errorMessage: string | null;
  videoUrl?: string | null;
};

type UploadUrlResponse = { uploadUrl: string; path: string; token: string; taskId: string };

async function requestUploadUrl(ext: string): Promise<UploadUrlResponse> {
  const response = await fetch("/api/ai-videos/tasks/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "portrait", ext }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to prepare the image upload.");
  }
  return data as UploadUrlResponse;
}

async function putFile(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) {
    throw new Error("Failed to upload the image. Please try again.");
  }
}

async function validateImage(file: File): Promise<string | null> {
  if (!(file.type in PORTRAIT_MIME_TO_EXT)) return "Use a JPG, PNG or WebP image.";
  if (file.size > PORTRAIT_MAX_BYTES) return "Images must be 10 MB or smaller.";
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (Math.min(width, height) < IMAGE_MIN_SIDE || Math.max(width, height) > IMAGE_MAX_SIDE) {
      return `Each side must be between ${IMAGE_MIN_SIDE} and ${IMAGE_MAX_SIDE} pixels.`;
    }
    const aspect = width / height;
    if (aspect < IMAGE_MIN_ASPECT || aspect > IMAGE_MAX_ASPECT) {
      return "That image is too tall or too wide. Try a less extreme crop.";
    }
  } catch {
    return "We couldn't read that image. Try another file.";
  }
  return null;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GenerateVideoForm({
  initialRemaining,
  limit,
  isMock,
  models,
}: {
  initialRemaining: number;
  limit: number;
  isMock: boolean;
  models: readonly VideoModel[];
}) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [mode, setMode] = useState<VideoMode>(DEFAULT_MODE);
  const [format, setFormat] = useState<FormatValue>({
    ratio: "9:16",
    resolution: "720p",
    duration: 5,
    generateAudio: true,
  });
  const patchFormat = (patch: Partial<FormatValue>) =>
    setFormat((current) => ({ ...current, ...patch }));
  const limits = limitsFor(mode);

  // Models differ in what they can produce, so switching pulls the format back
  // inside the new model's limits instead of leaving an impossible combination.
  const changeMode = (next: VideoMode) => {
    const nextLimits = limitsFor(next);
    setMode(next);
    setFormat((current) => ({
      ...current,
      duration: Math.min(current.duration, nextLimits.maxDuration),
      resolution: nextLimits.resolutions.includes(current.resolution)
        ? current.resolution
        : nextLimits.resolutions[0],
    }));
  };
  const [remaining, setRemaining] = useState(initialRemaining);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const busy = phase.kind === "submitting" || phase.kind === "generating";

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (phase.kind !== "generating") return;
    const { taskId, startedAt } = phase;
    let cancelled = false;

    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const clock = setInterval(tick, 1000);

    const poll = async () => {
      try {
        const response = await fetch(`/api/ai-videos/tasks/${taskId}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as TaskResponse;
        if (cancelled) return;
        if (data.status === "DELIVERED") {
          setPhase({ kind: "delivered", videoUrl: data.videoUrl ?? null });
        } else if (data.status === "FAILED") {
          setPhase({ kind: "failed", message: data.errorMessage ?? GENERIC_FAILURE });
        }
      } catch {
        // Transient network error: the next poll retries.
      }
    };
    const poller = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(clock);
      clearInterval(poller);
    };
  }, [phase]);

  const clearImage = () => {
    setImage(null);
    setImageError(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const problem = await validateImage(file);
    if (problem) {
      clearImage();
      setImageError(problem);
      return;
    }
    setImageError(null);
    setImage(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setFormError("Describe the video you want to generate.");
      return;
    }
    if (remaining <= 0 || busy) return;

    setFormError(null);
    setPhase({ kind: "submitting" });

    try {
      let upload: UploadUrlResponse | null = null;
      if (image) {
        upload = await requestUploadUrl(PORTRAIT_MIME_TO_EXT[image.type as PortraitMime]);
        await putFile(upload.uploadUrl, image);
      }

      const response = await fetch("/api/ai-videos/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          ...(upload ? { taskId: upload.taskId, portrait_path: upload.path } : {}),
          params: { mode, ...format },
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setRemaining(0);
        throw new Error(data.error || "You've reached today's generation limit.");
      }
      if (!response.ok) {
        throw new Error(data.error || "We couldn't start this video. Please try again.");
      }

      const task = data as TaskResponse;
      if (task.status === "FAILED") {
        setPhase({ kind: "failed", message: task.errorMessage ?? GENERIC_FAILURE });
        return;
      }
      setRemaining((value) => Math.max(0, value - 1));
      setPhase({ kind: "generating", taskId: task.id, startedAt: Date.now() });
    } catch (error) {
      setPhase({ kind: "idle" });
      setFormError(
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
    }
  };

  const resetForAnother = () => {
    setPhase({ kind: "idle" });
    setElapsed(0);
  };

  const generateButton = (
    <button
      type="submit"
      disabled={busy || !prompt.trim() || remaining <= 0}
      className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 lg:py-2.5"
    >
      <span className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="relative inline-flex items-center gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {phase.kind === "submitting"
          ? "Submitting…"
          : phase.kind === "generating"
            ? "Generating…"
            : "Generate video"}
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      {isMock && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Mock mode — no video credits used.</span> Generations
            return a sample clip after about 10 seconds.
          </p>
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1.5fr_1fr]">
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <fieldset
            disabled={busy}
            className="space-y-6 lg:space-y-4 lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:p-5 lg:shadow-sm"
          >
            <div className="space-y-6 lg:flex lg:flex-row-reverse lg:items-start lg:gap-4 lg:space-y-0">
              <section className={`${CARD_BELOW_LG} lg:min-w-0 lg:flex-1`}>
                <div className="flex items-baseline justify-between gap-4 lg:sr-only">
                  <label
                    htmlFor="prompt"
                    className="text-sm font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Prompt
                  </label>
                  <span className="text-xs tabular-nums text-slate-400">
                    {prompt.length}/{PROMPT_MAX}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600 lg:hidden">
                  Describe the subject, action, scene, style, camera movement and sound. Put spoken
                  lines in quotes.
                </p>
                <textarea
                  id="prompt"
                  name="prompt"
                  rows={7}
                  maxLength={PROMPT_MAX}
                  placeholder={PROMPT_PLACEHOLDER}
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-700 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 lg:mt-0 lg:resize-none lg:border-transparent lg:bg-transparent lg:px-1 lg:py-1 lg:focus:border-transparent lg:focus:ring-0"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </section>

              <section className={`${CARD_BELOW_LG} lg:w-28 lg:shrink-0`}>
                <div className="lg:hidden">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Reference image <span className="normal-case text-slate-400">· optional</span>
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Guide the look, a product or a character — including yourself. Only upload
                    images you have the rights to use.
                  </p>
                </div>

                {previewUrl ? (
                  <>
                    <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 lg:hidden">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <Image
                          src={previewUrl}
                          alt="Reference image preview"
                          fill
                          unoptimized
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                        {image?.name}
                      </p>
                      <button
                        type="button"
                        onClick={clearImage}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                        aria-label="Remove reference image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="relative hidden h-28 w-28 overflow-hidden rounded-xl bg-slate-100 lg:block">
                      <Image
                        src={previewUrl}
                        alt="Reference image preview"
                        fill
                        unoptimized
                        sizes="112px"
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        aria-label="Remove reference image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <label
                    htmlFor="reference-image"
                    title="JPG, PNG or WebP · up to 10 MB · at least 300 px per side. Only upload images you have the rights to use."
                    className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50 lg:mt-0 lg:h-28 lg:w-28 lg:p-2"
                  >
                    <ImagePlus className="h-9 w-9 text-indigo-500 lg:h-6 lg:w-6" />
                    <span className="mt-3 text-sm font-semibold text-indigo-700 lg:hidden">
                      Upload reference image
                    </span>
                    <span className="mt-1 text-xs text-slate-500 lg:hidden">
                      JPG, PNG or WebP · up to 10 MB · at least 300 px per side
                    </span>
                    <span className="mt-1.5 hidden text-[11px] font-semibold leading-tight text-indigo-700 lg:block">
                      Reference image
                    </span>
                    <span className="hidden text-[10px] text-slate-400 lg:block">optional</span>
                  </label>
                )}
                <input
                  id="reference-image"
                  name="reference-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  ref={imageInputRef}
                  onChange={handleImageChange}
                />
                {imageError && (
                  <p className="mt-3 text-xs font-medium text-rose-600 lg:hidden">{imageError}</p>
                )}
              </section>
            </div>

            {imageError && (
              <p className="hidden text-xs font-medium text-rose-600 lg:block">{imageError}</p>
            )}

            {/* Small screens: model and format as their own card. */}
            <section className={`${CARD_BELOW_LG} space-y-5 lg:hidden`}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Format
              </h2>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Model
                </p>
                <ModelPicker
                  models={models}
                  value={mode}
                  onChange={changeMode}
                  className="mt-2 w-full"
                />
              </div>
              <FormatFields value={format} limits={limits} onChange={patchFormat} />
            </section>

            {/* Large screens: model and format tucked under the prompt. */}
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <ModelPicker models={models} value={mode} onChange={changeMode} />
              <FormatPopover value={format} limits={limits} onChange={patchFormat} />
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs tabular-nums text-slate-400">
                  {prompt.length}/{PROMPT_MAX}
                </span>
                {generateButton}
              </div>
            </div>
          </fieldset>

          {formError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              <p>
                <span className="font-semibold text-slate-900">
                  {remaining} generation{remaining === 1 ? "" : "s"} left today
                </span>{" "}
                <span className="text-slate-400">of {limit}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Generation can&apos;t be cancelled once started.
              </p>
            </div>
            <div className="lg:hidden">{generateButton}</div>
          </div>
        </form>

        <aside className="h-fit space-y-4 xl:sticky xl:top-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Preview
            </h2>
            <div
              className="relative mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-xl bg-slate-900"
              style={{ aspectRatio: RATIO_ASPECT[format.ratio] }}
            >
              {phase.kind === "delivered" && phase.videoUrl ? (
                <video
                  src={phase.videoUrl}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  {phase.kind === "generating" || phase.kind === "submitting" ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
                      <p className="text-sm font-semibold text-white">
                        {phase.kind === "submitting" ? "Submitting…" : "Generating your video…"}
                      </p>
                      {phase.kind === "generating" && (
                        <p className="font-mono text-xs text-slate-400">
                          {formatElapsed(elapsed)} elapsed · usually a few minutes
                        </p>
                      )}
                    </>
                  ) : phase.kind === "failed" ? (
                    <>
                      <AlertTriangle className="h-8 w-8 text-rose-300" />
                      <p className="text-sm font-semibold text-white">{phase.message}</p>
                    </>
                  ) : phase.kind === "delivered" ? (
                    <>
                      <Clapperboard className="h-8 w-8 text-emerald-300" />
                      <p className="text-sm font-semibold text-white">
                        Your video is ready in My Videos.
                      </p>
                    </>
                  ) : (
                    <>
                      <Clapperboard className="h-8 w-8 text-slate-500" />
                      <p className="text-sm text-slate-400">Your video will appear here.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {phase.kind === "generating" && (
              <p className="mt-4 text-xs text-slate-500">
                You can leave this page — the video will still be added to My Videos when it&apos;s
                done.
              </p>
            )}

            {phase.kind === "delivered" && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/creatorportal/ai-video"
                  className="text-sm font-semibold text-indigo-600 underline-offset-2 hover:underline"
                >
                  Post it to TikTok from My Videos →
                </Link>
                <button
                  type="button"
                  onClick={resetForAnother}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate another
                </button>
              </div>
            )}

            {phase.kind === "failed" && (
              <button
                type="button"
                onClick={resetForAnother}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </button>
            )}
          </section>

          <Link
            href="/creatorportal/ai-video/tasks"
            className="block text-center text-md font-semibold text-slate-500 hover:text-slate-800"
          >
            View all generation tasks →
          </Link>
        </aside>
      </div>
    </div>
  );
}
