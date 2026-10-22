import {
  PORTRAIT_MAX_BYTES,
  PORTRAIT_MIME_TO_EXT,
  REFERENCE_VIDEO_MAX_BYTES,
  REFERENCE_VIDEO_MIME_TO_EXT,
} from "@/lib/ai-video-task";
import {
  REFERENCE_DURATION_MIN_SEC,
  SOURCE_DURATION_TOLERANCE_SEC,
} from "@/lib/seedance/replicate";

/**
 * Browser-side helpers shared by the AI video tools: direct-to-storage uploads via
 * POST /api/ai-videos/tasks/upload-url, and the provider's limits on reference
 * images and videos, checked before anything is uploaded.
 */

// Provider limits for reference media (AI Open Platform video API v1.1 / Seedance 2.0).
// Videos are held to the same frame limits: a narrower video is rejected with
// "InvalidParameter: Width must be between 300px and 6000px".
const MEDIA_MIN_SIDE = 300;
const MEDIA_MAX_SIDE = 6000;
const MEDIA_MIN_ASPECT = 0.4;
const MEDIA_MAX_ASPECT = 2.5;

export type UploadKind =
  | "portrait"
  | "voice"
  | "reference_video"
  | "product_1"
  | "product_2"
  | "product_3";

export type UploadUrlResponse = { uploadUrl: string; path: string; token: string; taskId: string };

/** Pass the taskId from an earlier call so every file of one task lands in the same folder. */
export async function requestUploadUrl(
  kind: UploadKind,
  ext: string,
  taskId?: string
): Promise<UploadUrlResponse> {
  const response = await fetch("/api/ai-videos/tasks/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, ext, ...(taskId ? { taskId } : {}) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to prepare the upload.");
  }
  return data as UploadUrlResponse;
}

export async function putFile(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) {
    throw new Error("Failed to upload the file. Please try again.");
  }
}

function frameProblem(width: number, height: number, noun: string): string | null {
  if (Math.min(width, height) < MEDIA_MIN_SIDE || Math.max(width, height) > MEDIA_MAX_SIDE) {
    return `Each side of the ${noun} must be between ${MEDIA_MIN_SIDE} and ${MEDIA_MAX_SIDE} pixels.`;
  }
  const aspect = width / height;
  if (aspect < MEDIA_MIN_ASPECT || aspect > MEDIA_MAX_ASPECT) {
    return `That ${noun} is too tall or too wide. Try a less extreme crop.`;
  }
  return null;
}

/** Returns a creator-facing problem, or null when the image can be used. */
export async function validateImage(file: File): Promise<string | null> {
  if (!(file.type in PORTRAIT_MIME_TO_EXT)) return "Use a JPG, PNG or WebP image.";
  if (file.size > PORTRAIT_MAX_BYTES) return "Images must be 10 MB or smaller.";
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    return frameProblem(width, height, "image");
  } catch {
    return "We couldn't read that image. Try another file.";
  }
}

function readVideoMetadata(
  file: File
): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const result = {
        durationSec: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      done();
      resolve(result);
    };
    video.onerror = () => {
      done();
      reject(new Error("unreadable video"));
    };
    video.src = url;
  });
}

export type VideoCheck = { ok: true; durationSec: number } | { ok: false; problem: string };

/** `maxSec` is the creator's source ceiling for the chosen model (replicateSourceCeiling). */
export async function validateReferenceVideo(file: File, maxSec: number): Promise<VideoCheck> {
  if (!(file.type in REFERENCE_VIDEO_MIME_TO_EXT)) {
    return { ok: false, problem: "Use an MP4 or MOV video." };
  }
  if (file.size > REFERENCE_VIDEO_MAX_BYTES) {
    return { ok: false, problem: "Videos must be 50 MB or smaller." };
  }
  let meta: { durationSec: number; width: number; height: number };
  try {
    meta = await readVideoMetadata(file);
  } catch {
    return { ok: false, problem: "We couldn't read that video. Try another file." };
  }
  if (!Number.isFinite(meta.durationSec) || meta.durationSec < REFERENCE_DURATION_MIN_SEC) {
    return {
      ok: false,
      problem: `The video must be at least ${REFERENCE_DURATION_MIN_SEC} seconds long.`,
    };
  }
  if (meta.durationSec > maxSec + SOURCE_DURATION_TOLERANCE_SEC) {
    return {
      ok: false,
      problem: `The video can be up to ${maxSec} seconds. Trim it and upload again.`,
    };
  }
  const frame = frameProblem(meta.width, meta.height, "video");
  return frame ? { ok: false, problem: frame } : { ok: true, durationSec: meta.durationSec };
}
