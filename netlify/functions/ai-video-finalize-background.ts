import type { Context, Config } from "@netlify/functions";
import { finalizeTask } from "../../src/lib/ai-video-generation";
import { isValidFinalizeAuth } from "../../src/lib/ai-video-finalize-auth";

/**
 * Background function (Netlify's `*-background` naming: up to 15 minutes, the
 * caller gets 202 as soon as it is scheduled, the return value is ignored).
 *
 * Dispatched by syncTask (src/lib/ai-video-generation.ts) when the video provider
 * reports a task succeeded. Copies the generated video into the AI Video library
 * — a download plus an upload of up to tens of MB, too slow for a normal function.
 *
 * The payload is only the task id; finalizeTask re-reads the task and the provider
 * status itself, so nothing here can point it at an arbitrary URL. The request is
 * still signed (src/lib/ai-video-finalize-auth.ts) so only our own dispatch can
 * trigger it.
 */

const TASK_ID_PATTERN = /^[a-z0-9]{1,32}$/;

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload: unknown = await req.json().catch(() => null);
  const taskId = (payload as { taskId?: unknown } | null)?.taskId;
  if (typeof taskId !== "string" || !TASK_ID_PATTERN.test(taskId)) {
    console.error("[ai-video-finalize-background] rejected: invalid payload");
    return new Response("Bad request", { status: 400 });
  }

  if (
    !isValidFinalizeAuth(
      taskId,
      req.headers.get("x-finalize-timestamp"),
      req.headers.get("x-finalize-signature")
    )
  ) {
    console.error("[ai-video-finalize-background] rejected: auth", { taskId });
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await finalizeTask(taskId);
  } catch (error) {
    // finalizeTask releases its claim on failure; the next sync retries.
    console.error("[ai-video-finalize-background] finalize failed", {
      taskId,
      name: error instanceof Error ? error.name : typeof error,
    });
  }

  return new Response("ok", { status: 200 });
};

export const config: Config = {};
