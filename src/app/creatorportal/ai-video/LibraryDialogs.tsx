"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { VIDEO_NAME_MAX_LENGTH } from "@/lib/ai-video-task";
import { AiVideoRecord, VideoStatus } from "./types";

export const generatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

export const expiresFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const statusTokens: Record<VideoStatus, { label: string; tone: string }> = {
  ready: { label: "Ready to download", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  expired: { label: "Expired", tone: "bg-slate-100 text-slate-500 ring-slate-200" },
};

async function errorFrom(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : fallback;
}

/** The video's name, with an edit button that turns it into a field with Save / Cancel. */
function EditableName({
  videoId,
  name,
  onRenamed,
}: {
  videoId: string;
  name: string;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(name);
    setError(null);
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (!next) {
      setError("A video needs a name.");
      return;
    }
    if (next === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-videos/library/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!response.ok) {
        setError(await errorFrom(response, "Couldn't rename the video."));
        return;
      }
      onRenamed(next);
      setEditing(false);
    } catch {
      setError("Couldn't rename the video. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-base font-semibold text-slate-900" title={name}>
          {name}
        </h2>
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit name"
          title="Edit name"
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          aria-label="Video name"
          value={draft}
          maxLength={VIDEO_NAME_MAX_LENGTH}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setEditing(false)}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </form>
  );
}

export function PreviewModal({
  video,
  onRenamed,
  onClose,
}: {
  video: AiVideoRecord;
  onRenamed: (name: string) => void;
  onClose: () => void;
}) {
  const statusToken = statusTokens[video.status];

  // Portalled to <body>: the portal layout has a transformed ancestor, which would
  // otherwise make "fixed" relative to it and leave the dialog off-centre.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/80" onClick={onClose} />
      {/* Never taller than 90% of the viewport: the video gives up height, the rest keeps its own. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={video.name}
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white p-5 shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <EditableName videoId={video.id} name={video.name} onRenamed={onRenamed} />
            {video.prompt ? (
              <p className="line-clamp-2 text-sm text-slate-600" title={video.prompt}>
                <span className="font-semibold text-slate-500">Prompt</span> · {video.prompt}
              </p>
            ) : null}
            {video.format ? (
              <p className="text-xs text-slate-500">
                <span className="font-semibold">Format</span> · {video.format}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The browser's own player: scrubbing, volume, fullscreen, speed. */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-slate-900">
          <video
            key={video.id}
            src={video.videoUrl}
            controls
            autoPlay
            playsInline
            className="min-h-0 w-full flex-1 object-contain"
          />
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
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
          <p className="text-sm text-slate-500">
            Generated {generatedFormatter.format(new Date(video.generatedAt))} · Download window
            ends {expiresFormatter.format(new Date(video.expiresAt))}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Asks before deleting: a deleted video can't be brought back. */
export function DeleteDialog({
  video,
  onDeleted,
  onClose,
}: {
  video: AiVideoRecord;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-videos/library/${video.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await errorFrom(response, "Couldn't delete the video."));
        setDeleting(false);
        return;
      }
      onDeleted();
    } catch {
      setError("Couldn't delete the video. Check your connection and try again.");
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/80" onClick={deleting ? undefined : onClose} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-video-title"
        aria-describedby="delete-video-body"
        className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600">
          <Trash2 className="h-5 w-5" />
        </span>
        <h2
          id="delete-video-title"
          className="mt-4 break-words text-base font-semibold text-slate-900"
        >
          Delete {video.name}?
        </h2>
        <p id="delete-video-body" className="mt-1.5 text-sm text-slate-600">
          This permanently deletes the video. It can&apos;t be recovered.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
