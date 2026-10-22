import type { AiVideoTaskStatus } from "@prisma/client";

export type ReplicateHistoryItem = {
  id: string;
  status: AiVideoTaskStatus;
  productName: string;
  errorMessage: string | null;
  /** First product image (signed URL). */
  thumbnailUrl: string | null;
  /** Generated video (signed URL); set once delivered. */
  videoUrl: string | null;
  createdAt: string;
};
