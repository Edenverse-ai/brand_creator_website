/**
 * Supabase service-role helpers without the `server-only` marker, so plain-Node
 * runtimes (Netlify functions) can load them: outside Next.js, `server-only`
 * resolves to a module that throws on import. Next.js code keeps importing
 * "@/lib/supabase-admin", which adds the marker and re-exports this module.
 * The service key is never NEXT_PUBLIC, so it can't reach a client bundle either way.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AI_VIDEO_BUCKET } from "@/lib/tiktok/constants";

export const AI_VIDEO_TASK_BUCKET = "ai-video-tasks";
export { AI_VIDEO_BUCKET };

declare global {
  var _supabaseAdmin: SupabaseClient | undefined;
}

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

export class SupabaseUploadError extends Error {
  constructor(
    public readonly path: string,
    cause: Error
  ) {
    super(`Supabase upload failed for ${path}: ${cause.message}`);
    this.name = "SupabaseUploadError";
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (globalThis._supabaseAdmin) return globalThis._supabaseAdmin;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new SupabaseConfigError("Supabase admin client not configured");
  }
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  globalThis._supabaseAdmin = client;
  return client;
}

export async function uploadToBucket(path: string, file: File, contentType: string): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage.from(AI_VIDEO_TASK_BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new SupabaseUploadError(path, error);
  }
}

export async function deleteFromBucket(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const client = getSupabaseAdmin();
    const { error } = await client.storage.from(AI_VIDEO_TASK_BUCKET).remove(paths);
    if (error) {
      console.error("[supabase-admin] cleanup delete failed", { paths, message: error.message });
    }
  } catch (err) {
    console.error("[supabase-admin] cleanup unexpected error", {
      paths,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createSignedUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(AI_VIDEO_TASK_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) {
    console.error("[supabase-admin] signed URL failed", { path, message: error?.message });
    return null;
  }
  return data.signedUrl;
}

/**
 * Writes a generated video into the AI Video library bucket (My Videos, TikTok
 * publish). Upserts so a finalize retried after a partial failure can overwrite.
 */
export async function uploadToAiVideoBucket(
  path: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<void> {
  const client = getSupabaseAdmin();
  const { error } = await client.storage
    .from(AI_VIDEO_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) {
    throw new SupabaseUploadError(path, error);
  }
}

export async function createAiVideoSignedUrl(
  path: string,
  expiresInSec = 3600
): Promise<string | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(AI_VIDEO_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) {
    console.error("[supabase-admin] ai video signed URL failed", { message: error?.message });
    return null;
  }
  return data.signedUrl;
}

/**
 * Signed URL that makes the browser save the video under `filename` instead of
 * playing it (Supabase sets Content-Disposition: attachment via `download`).
 */
export async function createAiVideoDownloadUrl(
  path: string,
  filename: string,
  expiresInSec = 60
): Promise<string | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(AI_VIDEO_BUCKET)
    .createSignedUrl(path, expiresInSec, { download: filename });
  if (error || !data?.signedUrl) {
    console.error("[supabase-admin] ai video download URL failed", { message: error?.message });
    return null;
  }
  return data.signedUrl;
}

export async function createSignedUrls(
  paths: string[],
  expiresInSec = 3600
): Promise<Map<string, string | null>> {
  if (paths.length === 0) return new Map();
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(AI_VIDEO_TASK_BUCKET)
    .createSignedUrls(paths, expiresInSec);
  if (error || !data) {
    console.error("[supabase-admin] batch signed URLs failed", { message: error?.message });
    return new Map(paths.map((p) => [p, null]));
  }
  const map = new Map<string, string | null>();
  for (const entry of data) {
    if (entry.path) {
      map.set(entry.path, entry.signedUrl ?? null);
    }
  }
  // Ensure every requested path has an entry (Supabase may omit failed paths)
  for (const p of paths) {
    if (!map.has(p)) map.set(p, null);
  }
  return map;
}
