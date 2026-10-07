import { formatDistanceToNow } from "date-fns";
import { Lock, ListTodo, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createSignedUrls } from "@/lib/supabase-admin";
import { STATUS_DISPLAY } from "@/lib/ai-video-task";
import type { AiVideoTaskStatus } from "@prisma/client";
import TaskAdminRow, { type TaskAdminRowData } from "./TaskAdminRow";

export const dynamic = "force-dynamic";

const STATUS_ORDER: AiVideoTaskStatus[] = [
  "QUEUED",
  "GENERATING",
  "IN_REVIEW",
  "DELIVERED",
  "FAILED",
];

export default async function StoryclawAdminPage() {
  const rows = await prisma.aiVideoTask.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      prompt: true,
      status: true,
      outputUrl: true,
      outputPath: true,
      notes: true,
      voicePath: true,
      portraitPath: true,
      createdAt: true,
      updatedAt: true,
      creatorId: true,
      creator: { select: { id: true, email: true, name: true } },
    },
  });

  const portraitPaths = rows.map((r) => r.portraitPath).filter((p): p is string => p !== null);
  const voicePaths = rows.map((r) => r.voicePath).filter((p): p is string => p !== null);
  const outputPaths = rows.map((r) => r.outputPath).filter((p): p is string => p !== null);

  const [portraitMap, voiceMap, outputMap] = await Promise.all([
    createSignedUrls(portraitPaths),
    createSignedUrls(voicePaths),
    createSignedUrls(outputPaths),
  ]);

  const tasks: Array<TaskAdminRowData & { rowKey: string }> = rows.map((r) => ({
    id: r.id,
    creatorLabel: r.creator?.name ?? r.creator?.email ?? r.creatorId,
    prompt: r.prompt,
    status: r.status,
    outputUrl: r.outputUrl,
    outputPath: r.outputPath,
    outputSignedUrl: r.outputPath ? (outputMap.get(r.outputPath) ?? null) : null,
    notes: r.notes,
    voiceSignedUrl: r.voicePath ? (voiceMap.get(r.voicePath) ?? null) : null,
    portraitSignedUrl: r.portraitPath ? (portraitMap.get(r.portraitPath) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    rowKey: `${r.id}-${r.updatedAt.toISOString()}`,
  }));

  const counts = STATUS_ORDER.reduce<Record<AiVideoTaskStatus, number>>(
    (acc, status) => {
      acc[status] = tasks.filter((t) => t.status === status).length;
      return acc;
    },
    { QUEUED: 0, GENERATING: 0, IN_REVIEW: 0, DELIVERED: 0, FAILED: 0 }
  );

  const latestUpdate = rows[0]?.updatedAt;
  const totalLabel = tasks.length === 100 ? "latest 100" : tasks.length.toString();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <header className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
              <Lock className="h-3 w-3" />
              Internal · unauthenticated
            </span>
            <span className="text-xs text-slate-500">Do not share this URL.</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500">
                Storyclaw control panel
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                AI Video Tasks
              </h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Review submissions, upload finished cuts, and move tasks through the fulfillment
                pipeline. Showing the {totalLabel} task{tasks.length === 1 ? "" : "s"} across all
                creators.
              </p>
            </div>
            {latestUpdate ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right text-xs text-slate-500 shadow-sm">
                <p className="font-semibold uppercase tracking-wide text-slate-400">Last update</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {formatDistanceToNow(latestUpdate, { addSuffix: true })}
                </p>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {STATUS_ORDER.map((status) => {
              const display = STATUS_DISPLAY[status];
              return (
                <div
                  key={status}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${display.className}`}
                    >
                      {display.label}
                    </span>
                    <ListTodo className="h-3.5 w-3.5 text-slate-300" />
                  </div>
                  <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                    {counts[status]}
                  </p>
                </div>
              );
            })}
          </div>
        </header>

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white p-16 text-center">
            <Sparkles className="h-8 w-8 text-slate-300" />
            <p className="text-base font-medium text-slate-700">No tasks yet</p>
            <p className="text-sm text-slate-500">
              New submissions from creators will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {tasks.map((task) => (
              <TaskAdminRow key={task.rowKey} task={task} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
