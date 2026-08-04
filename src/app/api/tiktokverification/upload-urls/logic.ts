import "server-only";
import { createSignedUpload } from "@/lib/storage/signed-upload";
import { isOwnedStoragePath } from "@/lib/storage/path-ownership";

/**
 * Field-for-field port of TikTokVerificationService
 * (backend/app/main/services/tiktokverify.py): storage bucket used for every
 * verification asset. Copied verbatim from `_upload_to_bucket` /
 * `generate_upload_urls` (`self.supabase.storage.from_("verification-assets")`).
 */
export const VERIFICATION_ASSETS_BUCKET = "verification-assets";

// Mirrors the `file_mappings` dict inside generate_upload_urls (tiktokverify.py
// service): frontend upload key -> on-disk file name (sans extension).
const FILE_NAME_BY_KEY: Record<string, string> = {
  id_front_file: "id_front",
  handheld_id_file: "id_handheld",
  backend_ss_file: "backend_ss",
  signed_auth_file: "authorization",
  identity_video_file: "identity_video",
};

export interface UploadUrlFileRequest {
  key: string;
  extension: string;
}

export interface UploadUrlEntry {
  upload_url: string;
  file_path: string;
  token: string | null;
}

/**
 * Field-for-field port of TikTokVerificationService.generate_upload_urls. Path
 * scheme is `{id_number}/{file_name}.{extension}`, identical to the Python service.
 * Any `key` not in FILE_NAME_BY_KEY is silently skipped, matching the Python
 * service's `if file_key in file_mappings:` guard (unrecognized keys are dropped,
 * not rejected).
 */
export async function generateUploadUrls(
  idNumber: string,
  files: UploadUrlFileRequest[]
): Promise<Record<string, UploadUrlEntry>> {
  const recognized = files
    .map((fileInfo) => ({ fileInfo, fileName: FILE_NAME_BY_KEY[fileInfo.key] }))
    .filter((entry): entry is { fileInfo: UploadUrlFileRequest; fileName: string } =>
      Boolean(entry.fileName)
    );

  const entries = await Promise.all(
    recognized.map(async ({ fileInfo, fileName }) => {
      const filePath = `${idNumber}/${fileName}.${fileInfo.extension}`;
      // Defense in depth: filePath is built by string interpolation from the
      // caller-supplied id_number, so a crafted id_number containing "/", "..", or
      // "%" could otherwise mint a signed upload URL outside that id_number's own
      // folder (e.g. id_number "../victim" -> "../victim/id_front.png"). Assert the
      // constructed path is still structurally owned by id_number before minting.
      if (!isOwnedStoragePath(filePath, idNumber)) {
        throw new Error(
          `Refusing to mint an upload URL outside id_number's own folder: ${filePath}`
        );
      }
      const signed = await createSignedUpload(VERIFICATION_ASSETS_BUCKET, filePath);
      const entry: UploadUrlEntry = {
        upload_url: signed.uploadUrl,
        // Echo the locally-built path (not signed.path) to mirror the Python
        // service, which sets `"file_path": file_path` from its own local variable
        // rather than reading a path back out of the Supabase response.
        file_path: filePath,
        token: signed.token ?? null,
      };
      return [fileInfo.key, entry] as const;
    })
  );

  return Object.fromEntries(entries);
}
