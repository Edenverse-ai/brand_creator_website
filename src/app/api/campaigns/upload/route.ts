import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";

const CAMPAIGNS_BUCKET = "campaigns";

const Body = z.object({
  kind: z.enum(["campaign_image"]),
  ext: z.enum(["jpg", "jpeg", "png", "webp", "gif"]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { ext } = parsed.data;
  // Mirrors backend/app/main/services/upload_service.py UploadService.upload_general_file,
  // the handler the old /upload route forwarded to:
  //   file_extension = file.filename.split(".")[-1] if file.filename else "jpg"
  //   unique_filename = f"upload_{uuid.uuid4().hex}.{file_extension}"
  //   file_path = f"general/{unique_filename}"
  // uuid.uuid4().hex is a 32-char lowercase hex string with no dashes; randomUUID() is the
  // same RFC4122 v4 UUID with dashes, so stripping them reproduces the identical shape.
  const path = `general/upload_${randomUUID().replace(/-/g, "")}.${ext}`;

  try {
    const signed = await createSignedUpload(CAMPAIGNS_BUCKET, path);
    return NextResponse.json(signed);
  } catch (e) {
    console.error("campaigns/upload mint failed:", e);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
