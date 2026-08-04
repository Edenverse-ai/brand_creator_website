import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateUploadUrls } from "./logic";
import { idNumberSchema, findIdNumberCharacterMessage } from "../id-number";
import { tiktokVerificationLimiter } from "@/lib/rate-limiter";

// The only real caller (creatorportal/tiktok-verify/uploadHelper.ts's
// getFileExtension, invoked from page.tsx) derives `extension` from the lowercased
// tail of a browser File's `name` with NO validation of its own — that helper can
// technically emit any string a local filename ends in, so it does not itself bound
// what's "valid" here. This allowlist is instead derived from the five upload
// fields' actual accepted file types in creatorportal/tiktok-verify/page.tsx: the
// three image fields (id_front_file, handheld_id_file, backend_ss_file) advertise
// "PNG, JPG, GIF" (accept="image/*"); signed_auth_file's accept is the literal
// ".pdf,.jpg,.jpeg,.png" (advertised "PDF, JPG, PNG"); identity_video_file
// advertises "MP4, MOV" (accept="video/*"). Because `accept` is only an HTML
// filter hint (not an enforced constraint) and this route is public/unauthenticated,
// a caller can send any string here regardless of what a real browser file picker
// would produce — this enum is what closes that gap server-side.
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "pdf", "mp4", "mov"] as const;

const FileInfoSchema = z.object({
  key: z.string().min(1),
  extension: z.enum(ALLOWED_EXTENSIONS),
});

// Only 5 file keys are ever recognized (see FILE_NAME_BY_KEY in ./logic.ts), so 5 is
// the true ceiling — anything beyond that can only be junk or abuse. Without this
// cap, `generateUploadUrls`'s `Promise.all` fans out one concurrent service-role
// `createSignedUploadUrl` call per array entry.
const MAX_FILES = 5;

const Body = z.object({
  id_number: idNumberSchema,
  files: z.array(FileInfoSchema).max(MAX_FILES, `files must contain at most ${MAX_FILES} entries`),
});

function findFilesArrayTooLongMessage(error: z.ZodError): string | undefined {
  return error.issues.find((issue) => issue.path[0] === "files" && issue.code === "too_big")
    ?.message;
}

/**
 * Native port of tiktokverify.py's `POST /tiktokverification/upload-urls`
 * (`generate_upload_urls`). Mints presigned direct-to-storage upload URLs so the
 * browser can upload verification files straight to Supabase Storage instead of
 * relaying bytes through this server. Success shape matches Python's
 * `UploadUrlsResponse` byte-for-byte; the 400/500 error shapes match the Next proxy
 * this route replaces (which the only caller, uploadHelper.ts, already reads
 * `errorData.error` from).
 *
 * Public/unauthenticated, same as its sibling submission route (POST
 * /api/tiktokverification) — shares that route's IP rate limiter (same key
 * namespace, so minting upload URLs and finalizing a submission draw from one
 * combined per-IP budget) as the stand-in for a session guard.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (tiktokVerificationLimiter.isRateLimited(`tiktok-verify:${ip}`)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message =
      findIdNumberCharacterMessage(parsed.error) ??
      findFilesArrayTooLongMessage(parsed.error) ??
      "Missing id_number or files array";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const uploadUrls = await generateUploadUrls(parsed.data.id_number, parsed.data.files);
    return NextResponse.json({ success: true, upload_urls: uploadUrls });
  } catch (error) {
    // The thrown error (createSignedUpload, ./logic.ts) embeds the full storage path
    // — "{id_number}/{file}.{ext}" — so logging it verbatim would write a passport /
    // national ID number to logs on every mint failure. Log only the error's class
    // name; the response was already generic.
    console.error(
      "tiktokverification/upload-urls: failed to generate upload URLs",
      error instanceof Error ? error.name : "unknown error"
    );
    return NextResponse.json({ error: "Failed to generate upload URLs" }, { status: 500 });
  }
}
