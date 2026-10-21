import { prisma } from "@/lib/prisma";
import { buildLibraryVideoPath } from "@/lib/ai-video-task";
import { createAiVideoSignedUrl, createSignedUrls } from "@/lib/supabase-admin";
import type { ReplicateHistoryItem } from "./types";

// The History panel shows the latest three, plus one for a submission in flight.
const HISTORY_SIZE = 4;

function productNameOf(input: unknown): string {
  const name = (input as { productName?: unknown } | null)?.productName;
  return typeof name === "string" && name ? name : "Untitled product";
}

/** The creator's latest trend replicates, newest first, with signed media URLs. */
export async function fetchReplicateHistory(creatorId: string): Promise<ReplicateHistoryItem[]> {
  const rows = await prisma.aiVideoTask.findMany({
    where: { creatorId, kind: "replicate" },
    orderBy: { createdAt: "desc" },
    take: HISTORY_SIZE,
    select: {
      id: true,
      creatorId: true,
      status: true,
      errorMessage: true,
      aiVideoId: true,
      productImagePaths: true,
      replicateInput: true,
      createdAt: true,
    },
  });

  const thumbnailPaths = rows
    .map((row) => row.productImagePaths[0])
    .filter((path): path is string => Boolean(path));
  const [thumbnails, videoUrls] = await Promise.all([
    createSignedUrls(thumbnailPaths),
    Promise.all(
      rows.map((row) =>
        row.status === "DELIVERED" && row.aiVideoId
          ? createAiVideoSignedUrl(buildLibraryVideoPath(row.creatorId, row.id))
          : Promise.resolve(null)
      )
    ),
  ]);

  return rows.map((row, index) => ({
    id: row.id,
    status: row.status,
    productName: productNameOf(row.replicateInput),
    errorMessage: row.errorMessage,
    thumbnailUrl: row.productImagePaths[0]
      ? (thumbnails.get(row.productImagePaths[0]) ?? null)
      : null,
    videoUrl: videoUrls[index],
    createdAt: row.createdAt.toISOString(),
  }));
}
