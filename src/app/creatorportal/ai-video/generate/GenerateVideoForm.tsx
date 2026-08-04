"use client";

import { FormEvent, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FileAudio, FileImage, Loader2, Sparkles } from "lucide-react";
import {
  PORTRAIT_MAX_BYTES,
  PORTRAIT_MIME_TO_EXT,
  VOICE_MAX_BYTES,
  VOICE_MIME_TO_EXT,
  type PortraitMime,
  type VoiceMime,
} from "@/lib/ai-video-task";

type SubmissionState =
  | { type: "idle" }
  | { type: "success"; taskId: string }
  | { type: "error"; message: string };

type UploadUrlResponse = { uploadUrl: string; path: string; token: string; taskId: string };

async function requestUploadUrl(args: {
  kind: "portrait" | "voice";
  ext: string;
  taskId?: string;
}): Promise<UploadUrlResponse> {
  const response = await fetch("/api/ai-videos/tasks/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to prepare file upload.");
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
    throw new Error("Failed to upload file. Please try again.");
  }
}

export default function GenerateVideoForm() {
  const { status: sessionStatus } = useSession();
  const [prompt, setPrompt] = useState("");
  const [voice, setVoice] = useState<File | null>(null);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmissionState>({ type: "idle" });

  const voiceInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (sessionStatus === "loading") {
      return;
    }
    if (sessionStatus !== "authenticated") {
      setStatus({
        type: "error",
        message: "You must be signed in as a creator to submit a request.",
      });
      return;
    }
    if (!prompt.trim()) {
      setStatus({ type: "error", message: "Please provide a generation prompt." });
      return;
    }
    if (!portrait) {
      setStatus({ type: "error", message: "Please upload a portrait reference image." });
      return;
    }
    if (!(portrait.type in PORTRAIT_MIME_TO_EXT)) {
      setStatus({ type: "error", message: "Unsupported portrait file type." });
      return;
    }
    if (portrait.size > PORTRAIT_MAX_BYTES) {
      setStatus({ type: "error", message: "Portrait file exceeds the 10 MB size limit." });
      return;
    }
    if (voice) {
      if (!(voice.type in VOICE_MIME_TO_EXT)) {
        setStatus({ type: "error", message: "Unsupported voice file type." });
        return;
      }
      if (voice.size > VOICE_MAX_BYTES) {
        setStatus({ type: "error", message: "Voice file exceeds the 25 MB size limit." });
        return;
      }
    }

    setIsSubmitting(true);
    setStatus({ type: "idle" });

    try {
      const portraitUpload = await requestUploadUrl({
        kind: "portrait",
        ext: PORTRAIT_MIME_TO_EXT[portrait.type as PortraitMime],
      });
      await putFile(portraitUpload.uploadUrl, portrait);

      let voicePath: string | undefined;
      if (voice) {
        const voiceUpload = await requestUploadUrl({
          kind: "voice",
          ext: VOICE_MIME_TO_EXT[voice.type as VoiceMime],
          taskId: portraitUpload.taskId,
        });
        await putFile(voiceUpload.uploadUrl, voice);
        voicePath = voiceUpload.path;
      }

      const response = await fetch("/api/ai-videos/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          taskId: portraitUpload.taskId,
          portrait_path: portraitUpload.path,
          ...(voicePath ? { voice_path: voicePath } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to queue AI video request.");
      }
      setStatus({ type: "success", taskId: data.id });
      setPrompt("");
      setVoice(null);
      setPortrait(null);
      if (voiceInputRef.current) voiceInputRef.current.value = "";
      if (portraitInputRef.current) portraitInputRef.current.value = "";
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while submitting your request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {status.type !== "idle" && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            status.type === "success"
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
              : "border-rose-200 bg-rose-50/70 text-rose-700"
          }`}
        >
          {status.type === "success" ? (
            <>
              <p className="font-semibold">Task queued.</p>
              <p className="mt-1 text-emerald-700">
                Task ID: <span className="font-mono text-xs">{status.taskId}</span>
              </p>
              <p className="mt-2">
                <Link
                  href="/creatorportal/ai-video/tasks"
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  View all tasks →
                </Link>
              </p>
            </>
          ) : (
            status.message
          )}
        </div>
      )}

      <form className="grid gap-6 lg:grid-cols-[1.3fr_1fr]" onSubmit={handleSubmit}>
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Voice upload
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Provide an audio sample for cloning—30 seconds or longer works best. WAV, MP3, or M4A
              up to 25 MB. Optional.
            </p>
            <label
              htmlFor="voice"
              className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
            >
              <FileAudio className="h-10 w-10 text-indigo-500" />
              <span className="mt-3 text-sm font-semibold text-indigo-700">
                Click to upload voice sample
              </span>
              <span className="mt-1 text-xs text-slate-500">Or drag and drop an audio file</span>
              <input
                id="voice"
                name="voice"
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                className="hidden"
                ref={voiceInputRef}
                onChange={(event) => setVoice(event.target.files?.[0] ?? null)}
              />
            </label>
            {voice && (
              <p className="mt-3 truncate text-xs font-medium text-indigo-700">{voice.name}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Creative prompt
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Outline the storyline, pacing notes, and CTAs you want in the finished video.
            </p>
            <div className="mt-4">
              <label
                htmlFor="prompt"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Generation prompt
              </label>
              <textarea
                id="prompt"
                name="prompt"
                rows={8}
                placeholder="Example: Create a 30s vertical video highlighting our winter skincare capsule..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-700 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                required
              />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Portrait reference
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Upload a clear facial image of the target talent. Front-facing with neutral lighting.
              Required.
            </p>
            <label
              htmlFor="portrait"
              className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center transition hover:border-slate-300 hover:bg-slate-100"
            >
              <FileImage className="h-10 w-10 text-slate-500" />
              <span className="mt-3 text-sm font-semibold text-slate-700">
                Upload portrait image
              </span>
              <span className="mt-1 text-xs text-slate-500">
                JPG, PNG, or WebP — minimum 1080x1080
              </span>
              <input
                id="portrait"
                name="portrait"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                ref={portraitInputRef}
                onChange={(event) => setPortrait(event.target.files?.[0] ?? null)}
              />
            </label>
            {portrait && (
              <p className="mt-3 truncate text-xs font-medium text-slate-700">{portrait.name}</p>
            )}

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-500">
              <p className="font-semibold text-slate-600">Tips for fast approvals</p>
              <ul className="mt-2 space-y-1">
                <li>• Use raw files rather than screenshots to avoid compression artifacts.</li>
                <li>• Keep visible logos or watermarks out of frame.</li>
                <li>• Confirm likeness permissions before uploading third-party talent.</li>
              </ul>
            </div>
          </section>

          <button
            type="submit"
            disabled={isSubmitting || sessionStatus === "loading" || !prompt.trim() || !portrait}
            className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <span className="relative inline-flex items-center gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isSubmitting ? "Submitting…" : "Generate video"}
            </span>
          </button>
        </aside>
      </form>
    </>
  );
}
