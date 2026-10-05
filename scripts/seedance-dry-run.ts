#!/usr/bin/env tsx
/**
 * Prints the exact create-task request the app would send to the AI Open
 * Platform video API — method, URL, headers (key masked) and JSON body — and
 * exits. It NEVER sends anything, so it costs no tokens.
 *
 * Usage (Git Bash):
 *   npx tsx scripts/seedance-dry-run.ts
 *   npx tsx --env-file=.env.local scripts/seedance-dry-run.ts --prompt "a cat" --image https://...
 *
 * Compare the output with the curl examples in the provider doc before any
 * manual live test.
 */
import { buildCreateRequest } from "../src/lib/seedance/client";
import { getSeedanceMode } from "../src/lib/seedance/config";
import { generationParamsSchema } from "../src/lib/seedance/schema";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function mask(key: string): string {
  if (!key) return "<VIDEO_API_KEY not set>";
  return key.length <= 8 ? "****" : `${key.slice(0, 4)}****${key.slice(-2)}`;
}

const baseUrl = process.env.VIDEO_API_BASE_URL?.trim() || "{BASE_URL}";
const apiKey = process.env.VIDEO_API_KEY?.trim() ?? "";

const { url, init } = buildCreateRequest(
  {
    prompt: arg("prompt") ?? "A cat running through long grass, cinematic, golden hour",
    mode: getSeedanceMode(),
    params: generationParamsSchema.parse({
      ratio: arg("ratio"),
      duration: arg("duration") ? Number(arg("duration")) : undefined,
      resolution: arg("resolution"),
      generateAudio: arg("audio") ? arg("audio") === "true" : undefined,
    }),
    referenceImageUrl: arg("image") ?? null,
  },
  { baseUrl, apiKey: mask(apiKey) }
);

console.log("DRY RUN — nothing is sent.\n");
console.log(`${init.method} ${url}`);
for (const [name, value] of Object.entries(init.headers as Record<string, string>)) {
  console.log(`${name}: ${value}`);
}
console.log();
console.log(JSON.stringify(JSON.parse(init.body as string), null, 2));
console.log(
  `\nSEEDANCE_LIVE=${process.env.SEEDANCE_LIVE === "1" ? "1 (live calls enabled)" : "off (app uses the mock provider)"}`
);
