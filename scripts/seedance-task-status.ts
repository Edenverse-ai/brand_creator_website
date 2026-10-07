#!/usr/bin/env tsx
/**
 * Looks up one video generation task at the provider and prints the raw
 * response — status, failure reason, usage. Status lookups are FREE (only
 * creating a task is billable), but this does call the real API with your key.
 *
 * Usage (Git Bash or PowerShell):
 *   npx tsx --env-file=.env.local scripts/seedance-task-status.ts <providerTaskId>
 *
 * <providerTaskId> is AiVideoTask.providerTaskId (starts with "kz-cgt-"), also
 * printed in the server log line "[ai-video-generation] provider reported failure".
 */
import { STATUS_PATH } from "../src/lib/seedance/config";

async function main() {
  const taskId = process.argv[2];
  const baseUrl = process.env.VIDEO_API_BASE_URL?.trim();
  const apiKey = process.env.VIDEO_API_KEY?.trim();

  if (!taskId) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/seedance-task-status.ts <providerTaskId>"
    );
    process.exit(1);
  }
  if (!baseUrl || !apiKey) {
    console.error("VIDEO_API_BASE_URL and VIDEO_API_KEY must be set (pass --env-file=.env.local).");
    process.exit(1);
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${STATUS_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({ task_id: taskId }),
  });

  console.log(`HTTP ${response.status}`);
  const text = await response.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((error) => {
  console.error("Lookup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
