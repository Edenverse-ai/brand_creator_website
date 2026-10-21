import { z } from "zod";

export const PORTRAIT_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_MAX_BYTES = 25 * 1024 * 1024;

export const PORTRAIT_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const VOICE_MIME_TO_EXT = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
} as const;

export const OUTPUT_MAX_BYTES = 200 * 1024 * 1024;

/** What an AiVideoTask produces: a prompt-driven generation or a trend replicate. */
export const AI_VIDEO_TASK_KINDS = ["generate", "replicate"] as const;
export type AiVideoTaskKind = (typeof AI_VIDEO_TASK_KINDS)[number];

// Trend replicate inputs. The size cap is the provider's per-file limit for
// reference videos (Seedance 2.0); durations live in src/lib/seedance/replicate.ts.
// Product images reuse the portrait limits, which match its reference-image limits.
export const REFERENCE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const REFERENCE_VIDEO_MIME_TO_EXT = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
} as const;
export type ReferenceVideoMime = keyof typeof REFERENCE_VIDEO_MIME_TO_EXT;
export const PRODUCT_IMAGES_MAX = 3;

export const VIDEO_MIME_TO_EXT = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
} as const;

export type PortraitMime = keyof typeof PORTRAIT_MIME_TO_EXT;
export type VoiceMime = keyof typeof VOICE_MIME_TO_EXT;
export type VideoMime = keyof typeof VIDEO_MIME_TO_EXT;

export type FileValidationResult = { ok: true } | { ok: false; status: 400 | 413; error: string };

export function validatePortraitFile(file: File): FileValidationResult {
  if (!(file.type in PORTRAIT_MIME_TO_EXT)) {
    return { ok: false, status: 400, error: "Unsupported portrait file type" };
  }
  if (file.size > PORTRAIT_MAX_BYTES) {
    return { ok: false, status: 413, error: "Portrait file exceeds size limit" };
  }
  return { ok: true };
}

export function validateVoiceFile(file: File | null): FileValidationResult {
  if (file === null) return { ok: true };
  if (!(file.type in VOICE_MIME_TO_EXT)) {
    return { ok: false, status: 400, error: "Unsupported voice file type" };
  }
  if (file.size > VOICE_MAX_BYTES) {
    return { ok: false, status: 413, error: "Voice file exceeds size limit" };
  }
  return { ok: true };
}

export function validateOutputFile(file: File | null): FileValidationResult {
  if (file === null || file.size === 0) {
    return { ok: false, status: 400, error: "Output file required" };
  }
  if (!(file.type in VIDEO_MIME_TO_EXT)) {
    return { ok: false, status: 400, error: "Unsupported output file type" };
  }
  if (file.size > OUTPUT_MAX_BYTES) {
    return { ok: false, status: 413, error: "Output file exceeds size limit" };
  }
  return { ok: true };
}

export function buildPortraitPath(creatorId: string, taskId: string, mime: PortraitMime): string {
  return `${creatorId}/${taskId}/portrait.${PORTRAIT_MIME_TO_EXT[mime]}`;
}

export function buildVoicePath(creatorId: string, taskId: string, mime: VoiceMime): string {
  return `${creatorId}/${taskId}/voice.${VOICE_MIME_TO_EXT[mime]}`;
}

export function buildOutputPath(creatorId: string, taskId: string, mime: VideoMime): string {
  return `${creatorId}/${taskId}/output.${VIDEO_MIME_TO_EXT[mime]}`;
}

export function buildReferenceVideoPath(
  creatorId: string,
  taskId: string,
  ext: (typeof REFERENCE_VIDEO_MIME_TO_EXT)[ReferenceVideoMime]
): string {
  return `${creatorId}/${taskId}/reference-video.${ext}`;
}

/** `slot` is 1-based, matching the "Image N" numbering in the replicate prompt. */
export function buildProductImagePath(
  creatorId: string,
  taskId: string,
  slot: number,
  ext: (typeof PORTRAIT_MIME_TO_EXT)[PortraitMime]
): string {
  return `${creatorId}/${taskId}/product-${slot}.${ext}`;
}

/** Object path of a generated video in the AI Video library bucket (aivideogenerated). */
export function buildLibraryVideoPath(creatorId: string, taskId: string): string {
  return `${creatorId}/${taskId}.mp4`;
}

export const promptSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Prompt required").max(5000));

const baseStatusSchema = z.enum(["QUEUED", "GENERATING", "IN_REVIEW", "DELIVERED", "FAILED"]);

export const patchTaskSchema = z.object({
  status: baseStatusSchema,
  outputUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

export const STATUS_DISPLAY = {
  QUEUED: { label: "Queued", className: "bg-slate-100 text-slate-700" },
  GENERATING: { label: "Generating", className: "bg-indigo-100 text-indigo-700" },
  IN_REVIEW: { label: "In Review", className: "bg-amber-100 text-amber-700" },
  DELIVERED: { label: "Delivered", className: "bg-emerald-100 text-emerald-700" },
  FAILED: { label: "Failed", className: "bg-rose-100 text-rose-700" },
} as const;

/** Longest name a video in My Videos can have. */
export const VIDEO_NAME_MAX_LENGTH = 80;
