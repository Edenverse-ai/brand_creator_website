import type { Context, Config } from "@netlify/functions";
import { prisma } from "../../src/lib/prisma";
import { syncTask } from "../../src/lib/ai-video-generation";

/**
 * Scheduled sweep: every 10 minutes, advance every GENERATING task so finished
 * videos reach the library even if the creator never comes back to the page.
 * See docs/superpowers/specs/2026-10-05-seedance-video-generation-design.md §5.
 *
 * Scheduled functions get about 30 s per run, so this only checks status (free,
 * fast) and leaves the download/upload to ai-video-finalize-background. Checks run
 * a few at a time, stop starting after SWEEP_BUDGET_MS, and go least-recently-
 * checked first so slow tasks can't starve the rest; leftovers wait for the next run.
 *
 * Netlify only runs schedules on published deploys — on previews and locally,
 * invoke it by hand (`netlify functions:invoke ai-video-sync-scheduled`).
 */

export const SWEEP_CONCURRENCY = 5;
export const SWEEP_BUDGET_MS = 20_000;
const SWEEP_BATCH_SIZE = 50;

export default async (_req: Request, _context: Context) => {
  const startedAt = Date.now();
  const tasks = await prisma.aiVideoTask.findMany({
    where: { status: "GENERATING" },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: SWEEP_BATCH_SIZE,
    select: { id: true },
  });

  let next = 0;
  let checked = 0;
  const worker = async () => {
    while (next < tasks.length && Date.now() - startedAt < SWEEP_BUDGET_MS) {
      const { id } = tasks[next++];
      try {
        await syncTask(id);
      } catch (error) {
        console.error("[ai-video-sync-scheduled] sync failed", {
          taskId: id,
          name: error instanceof Error ? error.name : typeof error,
        });
      }
      checked += 1;
    }
  };

  await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, tasks.length) }, worker));

  if (tasks.length > 0) {
    console.log("[ai-video-sync-scheduled] sweep done", { found: tasks.length, checked });
  }
  return new Response("ok", { status: 200 });
};

export const config: Config = { schedule: "*/10 * * * *" };
