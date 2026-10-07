"use client";

import { ChangeEvent, FormEvent, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileAudio2,
  Hash,
  Loader2,
  Mic,
  Save,
  Upload,
  User,
  Video as VideoIcon,
} from "lucide-react";
import type { AiVideoTaskStatus } from "@prisma/client";
import { STATUS_DISPLAY } from "@/lib/ai-video-task";

export type TaskAdminRowData = {
  id: string;
  creatorLabel: string;
  prompt: string;
  status: AiVideoTaskStatus;
  outputUrl: string | null;
  outputPath: string | null;
  outputSignedUrl: string | null;
  notes: string | null;
  voiceSignedUrl: string | null;
  portraitSignedUrl: string | null;
  createdAt: string;
};

const STATUSES: AiVideoTaskStatus[] = ["QUEUED", "GENERATING", "IN_REVIEW", "DELIVERED", "FAILED"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskAdminRow({ task }: { task: TaskAdminRowData }) {
  const router = useRouter();
  const [status, setStatus] = useState<AiVideoTaskStatus>(task.status);
  const [outputUrl, setOutputUrl] = useState(task.outputUrl ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [promptExpanded, setPromptExpanded] = useState(false);

  const [outputFile, setOutputFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onUpload = async () => {
    if (!outputFile || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", outputFile);
      const response = await fetch(`/api/storyclaw-admin/tasks/${task.id}/output`, {
        method: "POST",
        body: fd,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setUploadError(data?.error ?? "Failed to upload output");
        return;
      }
      setOutputFile(null);
      startTransition(() => router.refresh());
    } catch {
      setUploadError("Network error — please try again");
    } finally {
      setIsUploading(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setOutputFile(event.target.files?.[0] ?? null);
    setUploadError(null);
  };

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/storyclaw-admin/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          outputUrl: outputUrl.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error ?? "Failed to update task");
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        task: { status: AiVideoTaskStatus; outputUrl: string | null; notes: string | null };
      } | null;
      if (payload?.task) {
        setStatus(payload.task.status);
        setOutputUrl(payload.task.outputUrl ?? "");
        setNotes(payload.task.notes ?? "");
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isSaving || isPending;
  const uploaded = task.outputPath !== null;
  const currentDisplay = STATUS_DISPLAY[task.status];
  const dirty =
    status !== task.status ||
    (outputUrl.trim() || "") !== (task.outputUrl ?? "") ||
    (notes.trim() || "") !== (task.notes ?? "");

  const isLongPrompt = task.prompt.length > 180;
  const promptToShow =
    promptExpanded || !isLongPrompt ? task.prompt : `${task.prompt.slice(0, 180).trimEnd()}…`;

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
          <Hash className="h-3 w-3 text-slate-400" />
          {task.id.slice(0, 8)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <User className="h-3 w-3" />
          </span>
          {task.creatorLabel}
        </span>
        <span className="text-xs text-slate-500">
          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${currentDisplay.className}`}
          >
            {currentDisplay.label}
          </span>
          {uploaded ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              Output ready
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Prompt
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {promptToShow}
            </p>
            {isLongPrompt ? (
              <button
                type="button"
                onClick={() => setPromptExpanded((v) => !v)}
                className="mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {promptExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Creator inputs
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                {task.portraitSignedUrl ? (
                  <Image
                    src={task.portraitSignedUrl}
                    alt="Portrait reference"
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                    no portrait
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                {task.portraitSignedUrl ? (
                  <a
                    href={task.portraitSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    <User className="h-3 w-3" />
                    Portrait
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                ) : null}
                {task.voiceSignedUrl ? (
                  <a
                    href={task.voiceSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    <Mic className="h-3 w-3" />
                    Voice sample
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                ) : (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-slate-400 ring-1 ring-slate-100">
                    <FileAudio2 className="h-3 w-3" />
                    No voice attached
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Output file
              </p>
              {uploaded ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Uploaded
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Not uploaded</span>
              )}
            </div>

            {uploaded && task.outputSignedUrl ? (
              <a
                href={task.outputSignedUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
              >
                <VideoIcon className="h-3.5 w-3.5 text-indigo-500" />
                Preview current output
                <ExternalLink className="ml-auto h-3 w-3 text-slate-400" />
              </a>
            ) : null}

            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50/30">
              <Upload className="h-4 w-4 text-slate-400" />
              {outputFile ? (
                <span className="font-medium text-slate-800">
                  {outputFile.name}{" "}
                  <span className="font-normal text-slate-400">
                    · {formatBytes(outputFile.size)}
                  </span>
                </span>
              ) : (
                <>
                  <span className="font-medium text-slate-700">Choose video file</span>
                  <span className="text-[11px] text-slate-400">mp4 · webm · mov</span>
                </>
              )}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={onFileChange}
                disabled={isUploading || busy}
                className="hidden"
              />
            </label>

            {uploadError ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-rose-600">
                <AlertCircle className="h-3 w-3" />
                {uploadError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={onUpload}
              disabled={!outputFile || isUploading || busy}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  {uploaded ? "Replace output" : "Upload output"}
                </>
              )}
            </button>
          </div>

          <form onSubmit={onSave} className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Status
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {STATUSES.map((s) => {
                  const active = s === status;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      disabled={busy}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {STATUS_DISPLAY[s].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor={`url-${task.id}`}
                className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                External output URL
              </label>
              <input
                id={`url-${task.id}`}
                type="url"
                placeholder="https://… (optional if file uploaded)"
                value={outputUrl}
                onChange={(e) => setOutputUrl(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                disabled={busy}
              />
            </div>

            <div>
              <label
                htmlFor={`notes-${task.id}`}
                className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                Notes
              </label>
              <textarea
                id={`notes-${task.id}`}
                placeholder="Internal notes for the creator…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                disabled={busy}
              />
            </div>

            {error ? (
              <p className="inline-flex items-center gap-1 text-xs text-rose-600">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !dirty}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  {dirty ? "Save changes" : "No changes"}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
