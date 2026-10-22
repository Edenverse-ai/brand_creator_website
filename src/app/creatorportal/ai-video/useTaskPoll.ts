"use client";

import { useEffect, useRef, useState } from "react";

export const POLL_INTERVAL_MS = 10_000;
export const GENERIC_FAILURE = "Video generation failed. You were not charged — please try again.";

export type TaskOutcome =
  | { status: "DELIVERED"; videoUrl: string | null }
  | { status: "FAILED"; message: string };

type TaskResponse = {
  id: string;
  status: string;
  errorMessage: string | null;
  videoUrl?: string | null;
};

/**
 * Polls GET /api/ai-videos/tasks/:id every 10 s while `task` is set, and calls
 * `onSettled` once it is delivered or failed. Returns the seconds elapsed since
 * `task.startedAt`, ticking every second.
 */
export function useTaskPoll(
  task: { taskId: string; startedAt: number } | null,
  onSettled: (outcome: TaskOutcome) => void
): number {
  const [elapsed, setElapsed] = useState(0);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const taskId = task?.taskId ?? null;
  const startedAt = task?.startedAt ?? 0;

  useEffect(() => {
    if (!taskId) return;
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
          onSettledRef.current({ status: "DELIVERED", videoUrl: data.videoUrl ?? null });
        } else if (data.status === "FAILED") {
          onSettledRef.current({ status: "FAILED", message: data.errorMessage ?? GENERIC_FAILURE });
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
  }, [taskId, startedAt]);

  return elapsed;
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
