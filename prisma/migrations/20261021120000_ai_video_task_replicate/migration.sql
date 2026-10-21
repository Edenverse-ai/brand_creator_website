-- Trend replicate (docs/superpowers/specs/2026-10-21-ai-video-trend-replicate-design.md).
-- Additive only: existing rows become kind = 'generate' and behave as before.

-- AlterTable
ALTER TABLE "AiVideoTask" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generate',
ADD COLUMN     "productImagePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "referenceVideoPath" TEXT,
ADD COLUMN     "replicateInput" JSONB;
