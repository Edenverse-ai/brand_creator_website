import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileAudio2 } from "lucide-react";
import { STATUS_DISPLAY } from "@/lib/ai-video-task";
import FailureReason from "../FailureReason";
import type { AiVideoTaskStatus } from "@prisma/client";

export type TaskRowData = {
  id: string;
  prompt: string;
  status: AiVideoTaskStatus;
  errorMessage: string | null;
  outputUrl: string | null;
  outputSignedUrl: string | null;
  hasVoice: boolean;
  portraitSignedUrl: string | null;
  /** Set for trend replicates; their prompt is composed by the app, not the creator. */
  replicateProductName: string | null;
  createdAt: string;
};

export default function TaskRow({ task }: { task: TaskRowData }) {
  const display = STATUS_DISPLAY[task.status];
  const created = formatDistanceToNow(new Date(task.createdAt), { addSuffix: true });
  const summary = task.replicateProductName ?? task.prompt;
  const promptPreview = summary.length > 80 ? `${summary.slice(0, 80)}…` : summary;

  const viewOutputHref =
    task.status === "DELIVERED" ? (task.outputSignedUrl ?? task.outputUrl ?? null) : null;

  return (
    <li className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {task.portraitSignedUrl ? (
          <Image
            src={task.portraitSignedUrl}
            alt={task.replicateProductName !== null ? "Product image" : "Portrait reference"}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            no preview
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
          {task.replicateProductName !== null && (
            <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
              Replicate
            </span>
          )}
          <span className="truncate">{promptPreview}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {created}
          {task.hasVoice ? (
            <span className="ml-2 inline-flex items-center gap-1 text-indigo-600">
              <FileAudio2 className="h-3 w-3" /> voice attached
            </span>
          ) : null}
        </p>
        {task.status === "FAILED" && task.errorMessage ? (
          <FailureReason message={task.errorMessage} className="mt-1" />
        ) : null}
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${display.className}`}
      >
        {display.label}
      </span>
      {viewOutputHref ? (
        <Link
          href={viewOutputHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline"
        >
          View output
        </Link>
      ) : null}
    </li>
  );
}
