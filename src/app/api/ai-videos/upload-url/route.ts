import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";

const Body = z.object({
  kind: z.enum(["voice_sample", "reference_image"]),
  ext: z.enum(["mp3", "wav", "m4a", "jpg", "jpeg", "png", "webp"]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, ext } = parsed.data;
  const path = `${session.user.id}/${kind}-${randomUUID()}.${ext}`;
  try {
    const signed = await createSignedUpload("aivideogenerated", path);
    return NextResponse.json(signed);
  } catch (e) {
    console.error("upload-url mint failed:", e);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
