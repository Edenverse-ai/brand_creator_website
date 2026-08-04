import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateUploadUrls } from "./logic";

const FileInfoSchema = z.object({
  key: z.string().min(1),
  extension: z.string().min(1),
});

const Body = z.object({
  id_number: z.string().min(1),
  files: z.array(FileInfoSchema),
});

/**
 * Native port of tiktokverify.py's `POST /tiktokverification/upload-urls`
 * (`generate_upload_urls`). Mints presigned direct-to-storage upload URLs so the
 * browser can upload verification files straight to Supabase Storage instead of
 * relaying bytes through this server. Success shape matches Python's
 * `UploadUrlsResponse` byte-for-byte; the 400/500 error shapes match the Next proxy
 * this route replaces (which the only caller, uploadHelper.ts, already reads
 * `errorData.error` from).
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing id_number or files array" }, { status: 400 });
  }

  try {
    const uploadUrls = await generateUploadUrls(parsed.data.id_number, parsed.data.files);
    return NextResponse.json({ success: true, upload_urls: uploadUrls });
  } catch (error) {
    console.error("tiktokverification/upload-urls: failed to generate upload URLs", error);
    return NextResponse.json({ error: "Failed to generate upload URLs" }, { status: 500 });
  }
}
