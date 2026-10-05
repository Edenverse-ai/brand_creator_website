import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAiVideoSignedUrl, createSignedUrls } from "@/lib/supabase-admin";
import { syncTask } from "@/lib/ai-video-generation";
import { buildLibraryVideoPath } from "@/lib/ai-video-task";
import TaskRow, { type TaskRowData } from "./TaskRow";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const PAGE_SIZE = 50;
  const SYNC_ON_RENDER_LIMIT = 10;

  // Advance in-progress generations so a creator returning here sees the latest
  // state without waiting for the scheduled sweep. Failures just leave the row as is.
  const inProgress = await prisma.aiVideoTask.findMany({
    where: { creatorId: session.user.id, status: "GENERATING" },
    orderBy: { createdAt: "desc" },
    take: SYNC_ON_RENDER_LIMIT,
    select: { id: true },
  });
  await Promise.allSettled(inProgress.map((task) => syncTask(task.id)));

  const rows = await prisma.aiVideoTask.findMany({
    where: { creatorId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      creatorId: true,
      prompt: true,
      status: true,
      errorMessage: true,
      outputUrl: true,
      outputPath: true,
      aiVideoId: true,
      voicePath: true,
      portraitPath: true,
      createdAt: true,
    },
  });

  const portraitPaths = rows.map((r) => r.portraitPath).filter((p): p is string => p !== null);
  const outputPaths = rows.map((r) => r.outputPath).filter((p): p is string => p !== null);
  const generated = rows.filter((r) => r.status === "DELIVERED" && r.aiVideoId);

  const [portraitMap, outputMap, libraryUrls] = await Promise.all([
    createSignedUrls(portraitPaths),
    createSignedUrls(outputPaths),
    Promise.all(
      generated.map(
        async (r) =>
          [r.id, await createAiVideoSignedUrl(buildLibraryVideoPath(r.creatorId, r.id))] as const
      )
    ),
  ]);
  const libraryMap = new Map(libraryUrls);

  const tasks: TaskRowData[] = rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    status: r.status,
    errorMessage: r.errorMessage,
    outputUrl: r.outputUrl,
    // Manual deliveries live in ai-video-tasks; generated ones in the library bucket.
    outputSignedUrl: r.outputPath
      ? (outputMap.get(r.outputPath) ?? null)
      : (libraryMap.get(r.id) ?? null),
    hasVoice: r.voicePath !== null,
    portraitSignedUrl: r.portraitPath ? (portraitMap.get(r.portraitPath) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
            AI production suite
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Your AI video tasks</h1>
        </div>
        <Link
          href="/creatorportal/ai-video/generate"
          className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Generate new video
        </Link>
      </header>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-600">No tasks yet.</p>
          <Link
            href="/creatorportal/ai-video/generate"
            className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline"
          >
            Submit your first request →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
