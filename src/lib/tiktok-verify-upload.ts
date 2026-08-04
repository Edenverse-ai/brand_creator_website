// Shared file-extension allowlist for the TikTok verification upload flow
// (creatorportal/tiktok-verify/{page.tsx,uploadHelper.ts} <-> api/tiktokverification/
// upload-urls/route.ts). Defined ONCE here so the server-side zod enum and the
// client-side pre-flight check can never drift apart again.
//
// Task 2.3 re-review context: the previous allowlist was derived from the upload
// form's placeholder LABEL text ("PNG, JPG, GIF" / "MP4, MOV") instead of the fields'
// actual `accept` attributes, so real uploads a browser's picker happily allowed
// through — .webp screenshots, .heic/.heif iPhone photos, scanned .tif/.tiff IDs —
// were rejected by the server with a 400. This list is instead audited directly
// against creatorportal/tiktok-verify/page.tsx's five file inputs:
//   - id_front_file       accept="image/*"
//   - handheld_id_file    accept="image/*"
//   - backend_ss_file     accept="image/*"
//   - signed_auth_file    accept=".pdf,.jpg,.jpeg,.png"
//   - identity_video_file accept="video/*"
// `handleFileChange` (page.tsx) does no type filtering of its own, and `accept` is
// only a file-picker hint (not an enforced constraint, and this route is
// public/unauthenticated) — a caller can send any string regardless of what a real
// picker would produce, so this allowlist is what actually closes the gap
// server-side. The client-side check exists purely for fast, accurate UX feedback
// before a network round trip, not as the real enforcement boundary.

// What a browser's native "image/*" picker realistically hands back — not just the
// three formats the form's placeholder text advertised. webp is the dominant
// save-from-web format (and backend_ss_file's accept is literally on a "screenshot"
// field); heic/heif is the default iPhone camera format (the two ID-photo fields are
// commonly filled from a phone's photo library); avif/bmp/tif/tiff cover the rest of
// the realistic "image/*" long tail (scanned IDs in particular skew towards tif/tiff).
export const TIKTOK_VERIFY_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  "avif",
  "bmp",
  "tif",
  "tiff",
] as const;

// What a browser's native "video/*" picker realistically hands back for
// identity_video_file, beyond the mp4/mov the placeholder text advertised.
export const TIKTOK_VERIFY_VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v", "avi", "3gp"] as const;

// signed_auth_file's accept is the literal ".pdf,.jpg,.jpeg,.png" (NOT "image/*"), so
// "pdf" is the only extension that field adds beyond the image group above.
export const TIKTOK_VERIFY_DOCUMENT_EXTENSIONS = ["pdf"] as const;

// FileInfoSchema.extension (upload-urls/route.ts) isn't scoped per file `key` — every
// field's extension is checked against one flat enum, matching the pre-existing
// architecture (see that route's schema comment). This is that flat union.
export const TIKTOK_VERIFY_ALLOWED_EXTENSIONS = [
  ...TIKTOK_VERIFY_IMAGE_EXTENSIONS,
  ...TIKTOK_VERIFY_DOCUMENT_EXTENSIONS,
  ...TIKTOK_VERIFY_VIDEO_EXTENSIONS,
] as const;

export type TikTokVerifyExtension = (typeof TIKTOK_VERIFY_ALLOWED_EXTENSIONS)[number];

// Shared human-readable "here's what's accepted" fragment, reused by both the
// server's 400 message (upload-urls/route.ts's findExtensionMessage) and the
// client's pre-flight rejection message below, so the two can't drift into saying
// different things either.
export const TIKTOK_VERIFY_ALLOWED_EXTENSIONS_LABEL = TIKTOK_VERIFY_ALLOWED_EXTENSIONS.join(", ");

export function isAllowedTikTokVerifyExtension(
  extension: string
): extension is TikTokVerifyExtension {
  return (TIKTOK_VERIFY_ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

/**
 * Client-facing rejection message for a file whose extension isn't in the allowlist.
 * Names the actual file and its extension (unlike the server, the client always has
 * the original filename on hand), plus what's accepted. Shared by page.tsx's
 * pre-flight check and uploadHelper.ts's pre-network safety net so both say the same
 * thing.
 */
export function describeUnsupportedTikTokVerifyExtension(
  fileName: string,
  extension: string
): string {
  return `"${fileName}" has an unsupported file type (.${extension}). Accepted types: ${TIKTOK_VERIFY_ALLOWED_EXTENSIONS_LABEL}.`;
}
