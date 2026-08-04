// Client-side helper for the campaign product-photo upload flow. The bytes go straight to
// Supabase Storage via a presigned URL minted by POST /api/campaigns/upload — the Next.js
// server never sees the file content, so the checks below (previously enforced server-side by
// backend/app/main/services/upload_service.py UploadService._validate_file) now have to run here.

export const CAMPAIGN_IMAGE_BUCKET = "campaigns";

// Mirrors UploadService._validate_file's 5MB limit.
export const CAMPAIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Mirrors UploadService._validate_file's allowed_types list, mapped to the ext enum the
// upload-url route accepts.
export const CAMPAIGN_IMAGE_MIME_TO_EXT: Record<string, "jpg" | "png" | "webp" | "gif"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type CampaignImageExt =
  (typeof CAMPAIGN_IMAGE_MIME_TO_EXT)[keyof typeof CAMPAIGN_IMAGE_MIME_TO_EXT];

export type CampaignImageValidation = { ok: true } | { ok: false; error: string };

/**
 * Client-side stand-in for the validation the Python relay used to perform on received bytes.
 * Order matters: size is checked first to preserve the exact pre-existing error message/UX for
 * oversized files.
 */
export function validateCampaignImageFile(file: File): CampaignImageValidation {
  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Product photo must be less than 5MB" };
  }
  if (!(file.type in CAMPAIGN_IMAGE_MIME_TO_EXT)) {
    return { ok: false, error: "Product photo must be a JPEG, PNG, WebP, or GIF image" };
  }
  return { ok: true };
}

/**
 * Mirrors backend/app/main/services/upload_service.py UploadService._get_public_url's fallback
 * formula. Bucket and path scheme are unchanged from the Python implementation, so this must
 * produce byte-identical URLs to what the old relay returned.
 */
export function buildCampaignImagePublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${CAMPAIGN_IMAGE_BUCKET}/${path}`;
}

interface UploadUrlResponse {
  uploadUrl: string;
  path: string;
  token: string;
}

async function requestCampaignImageUploadUrl(ext: CampaignImageExt): Promise<UploadUrlResponse> {
  const res = await fetch("/api/campaigns/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "campaign_image", ext }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<UploadUrlResponse> & {
    error?: string;
  };
  if (!res.ok || !body.uploadUrl || !body.path) {
    throw new Error(body.error ?? "Failed to get upload URL");
  }
  return { uploadUrl: body.uploadUrl, path: body.path, token: body.token ?? "" };
}

async function putCampaignImageFile(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to upload product photo (${res.status}): ${text || res.statusText}`);
  }
}

/**
 * Full presigned upload flow for a campaign product photo: mint a signed URL, PUT the bytes
 * directly to storage, then return the public URL the caller should submit downstream — same
 * public URL shape (and same `product_photo` field usage) the Python relay used to return.
 *
 * Callers are expected to run `validateCampaignImageFile` first for immediate UX feedback; this
 * function re-validates as a safety net before ever calling the network.
 */
export async function uploadCampaignImage(file: File): Promise<string> {
  const validation = validateCampaignImageFile(file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const ext = CAMPAIGN_IMAGE_MIME_TO_EXT[file.type];
  const { uploadUrl, path } = await requestCampaignImageUploadUrl(ext);
  await putCampaignImageFile(uploadUrl, file);
  return buildCampaignImagePublicUrl(path);
}
