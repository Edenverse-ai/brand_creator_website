// Helper functions for direct file uploads to Supabase

import {
  isAllowedTikTokVerifyExtension,
  describeUnsupportedTikTokVerifyExtension,
} from "@/lib/tiktok-verify-upload";

export interface FileUploadInfo {
  key: string;
  extension: string;
  file: File;
}

export interface UploadUrlResponse {
  upload_url: string;
  file_path: string;
  token?: string;
}

export interface UploadUrlsResponse {
  success: boolean;
  upload_urls: Record<string, UploadUrlResponse>;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "jpg";
}

/**
 * Generate upload URLs for files
 */
export async function generateUploadUrls(
  idNumber: string,
  files: FileUploadInfo[]
): Promise<UploadUrlsResponse> {
  // Safety net: page.tsx's handleFileChange already rejects an unsupported file at
  // selection time for immediate UX feedback, but re-check here too — right before
  // the network call that used to be the ONLY place this was enforced — so any
  // caller that reaches this function some other way still fails fast locally
  // instead of discovering the rejection only after a round trip to the server.
  const unsupported = files.find((f) => !isAllowedTikTokVerifyExtension(f.extension));
  if (unsupported) {
    throw new Error(
      describeUnsupportedTikTokVerifyExtension(unsupported.file.name, unsupported.extension)
    );
  }

  const response = await fetch("/api/tiktokverification/upload-urls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id_number: idNumber,
      files: files.map((f) => ({
        key: f.key,
        extension: f.extension,
      })),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to generate upload URLs");
  }

  return await response.json();
}

/**
 * Upload file directly to Supabase using pre-signed URL
 */
export async function uploadFileToSupabase(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed due to network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload was aborted"));
    });

    // Open the request
    xhr.open("PUT", uploadUrl);

    // Set content type
    xhr.setRequestHeader("Content-Type", file.type);

    // Send the file
    xhr.send(file);
  });
}

/**
 * Upload multiple files with progress tracking
 */
export async function uploadMultipleFiles(
  files: FileUploadInfo[],
  uploadUrls: Record<string, UploadUrlResponse>,
  onProgress?: (fileKey: string, progress: number) => void,
  onFileComplete?: (fileKey: string) => void
): Promise<Record<string, string>> {
  const uploadPromises = files.map(async (fileInfo) => {
    const urlInfo = uploadUrls[fileInfo.key];
    if (!urlInfo) {
      throw new Error(`No upload URL found for ${fileInfo.key}`);
    }

    try {
      await uploadFileToSupabase(fileInfo.file, urlInfo.upload_url, (progress) =>
        onProgress?.(fileInfo.key, progress)
      );

      onFileComplete?.(fileInfo.key);
      return { key: fileInfo.key, path: urlInfo.file_path };
    } catch (error) {
      console.error(`Failed to upload ${fileInfo.key}:`, error);
      throw new Error(
        `Failed to upload ${fileInfo.key}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

  const results = await Promise.all(uploadPromises);

  // Convert array to object mapping file keys to paths
  const filePaths: Record<string, string> = {};
  results.forEach((result) => {
    filePaths[result.key] = result.path;
  });

  return filePaths;
}
