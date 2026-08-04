import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateUploadUrls } from "./logic";
import { idNumberSchema, findIdNumberCharacterMessage } from "../id-number";
import { tiktokVerificationUploadUrlsLimiter } from "@/lib/rate-limiter";
import {
  TIKTOK_VERIFY_ALLOWED_EXTENSIONS,
  TIKTOK_VERIFY_ALLOWED_EXTENSIONS_LABEL,
} from "@/lib/tiktok-verify-upload";

// The only real caller (creatorportal/tiktok-verify/uploadHelper.ts's
// getFileExtension, invoked from page.tsx) derives `extension` from the lowercased
// tail of a browser File's `name` with NO validation of its own — that helper can
// technically emit any string a local filename ends in, so it does not itself bound
// what's "valid" here. `accept` is only an HTML file-picker hint (not an enforced
// constraint) and this route is public/unauthenticated, so a caller can send any
// string here regardless of what a real browser file picker would produce — this
// enum is what closes that gap server-side.
//
// TIKTOK_VERIFY_ALLOWED_EXTENSIONS (src/lib/tiktok-verify-upload.ts) is the single
// source of truth for this list, shared with the client-side pre-flight check in
// creatorportal/tiktok-verify/page.tsx, so the two can't drift apart again the way
// they did before: the previous round derived this enum from the form's placeholder
// LABEL text ("PNG, JPG, GIF" / "MP4, MOV") instead of the fields' actual `accept`
// attributes, which rejected real browser uploads (.webp, .heic/.heif, scanned
// .tif/.tiff) that the picker had happily allowed through.
const FileInfoSchema = z.object({
  key: z.string().min(1),
  extension: z.enum(TIKTOK_VERIFY_ALLOWED_EXTENSIONS),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Picks out the "extension outside the allowlist" failure (zod issue path
 * ["files", n, "extension"], code "invalid_value") and reports it with the actual
 * rejected extension plus what's accepted, instead of letting it fall through to the
 * generic "Missing id_number or files array" message below — which named neither the
 * real problem nor the actual field. zod's issue for this code carries the allowed
 * `values` but not the rejected input itself, so the offending value is read back out
 * of the raw request body at the same ["files", n, "extension"] path the issue points
 * to.
 */
function findExtensionMessage(error: z.ZodError, rawBody: unknown): string | undefined {
  const issue = error.issues.find(
    (candidate) =>
      candidate.code === "invalid_value" &&
      candidate.path[0] === "files" &&
      candidate.path[2] === "extension"
  );
  if (!issue) return undefined;

  const fileIndex = issue.path[1];
  const files = isRecord(rawBody) && Array.isArray(rawBody.files) ? rawBody.files : undefined;
  const fileEntry = typeof fileIndex === "number" ? files?.[fileIndex] : undefined;
  const rejected =
    isRecord(fileEntry) && typeof fileEntry.extension === "string"
      ? fileEntry.extension
      : "that file";

  return `Unsupported file extension "${rejected}". Accepted extensions: ${TIKTOK_VERIFY_ALLOWED_EXTENSIONS_LABEL}.`;
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
 * /api/tiktokverification) — rate limited as the stand-in for a session guard, same
 * 5/hr-per-IP shape and message as that sibling, but through its OWN
 * `tiktokVerificationUploadUrlsLimiter` instance (see rate-limiter.ts), not a budget
 * shared with it. The two used to draw from one combined per-IP counter, which left a
 * legitimate applicant only ~2.5 full mint-then-submit cycles per hour (mint -> submit
 * -> fix a validation error -> re-mint -> re-submit already hits the 6th call); the
 * `files.max(5)` array cap below already bounds the per-request fan-out abuse that
 * shared budget was defending against, so splitting it doesn't reopen that hole.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (tiktokVerificationUploadUrlsLimiter.isRateLimited(`tiktok-verify-upload:${ip}`)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    const message =
      findIdNumberCharacterMessage(parsed.error) ??
      findFilesArrayTooLongMessage(parsed.error) ??
      findExtensionMessage(parsed.error, rawBody) ??
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
