import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface SignedUpload {
  uploadUrl: string;
  path: string;
  token: string;
}

export async function createSignedUpload(bucket: string, path: string): Promise<SignedUpload> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(
      `signed upload URL failed for ${bucket}/${path}: ${error?.message ?? "no data"}`
    );
  }
  return { uploadUrl: data.signedUrl, path: data.path, token: data.token };
}
