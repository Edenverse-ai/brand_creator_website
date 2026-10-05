-- Seedance video generation (docs/superpowers/specs/2026-10-05-seedance-video-generation-design.md).
--
-- Hand-trimmed to the schema delta for this change only. `prisma migrate dev` also
-- emitted pre-existing drift (DROP TABLE "Campaign", CREATE TABLE for models added
-- to schema.prisma without migrations); none of that belongs here.

-- AlterEnum
ALTER TYPE "AiVideoTaskStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "AiVideoTask" ADD COLUMN     "aiVideoId" UUID,
ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "finalizeStartedAt" TIMESTAMP(3),
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "params" JSONB,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerTaskId" TEXT,
ADD COLUMN     "submitStartedAt" TIMESTAMP(3),
ADD COLUMN     "traceId" TEXT,
ALTER COLUMN "portraitPath" DROP NOT NULL;

-- Generated videos are delivered into "AiVideo" (the My Videos library). The table
-- exists in production but was never created by a migration, so databases built
-- from migrations alone (local dev, E2E) lack it. IF NOT EXISTS keeps this a no-op
-- where it already exists.
CREATE TABLE IF NOT EXISTS "AiVideo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" TEXT,
    "generated_time" TIMESTAMPTZ(6),
    "video" TEXT,
    "tag" TEXT,
    "thumbnail_url" TEXT,

    CONSTRAINT "AiVideo_pkey" PRIMARY KEY ("id")
);
