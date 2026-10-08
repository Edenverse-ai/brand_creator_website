-- Videos in the My Videos library get a name creators can change.
--
-- Hand-written, not generated: `prisma migrate dev` would also emit the unrelated
-- schema drift described in docs/database.md. Every statement is safe to re-run.

ALTER TABLE "AiVideo" ADD COLUMN IF NOT EXISTS "name" TEXT;

-- Name the videos that already exist "ai-video-<n>", numbered per creator from
-- oldest to newest. Numbering continues after any "ai-video-<n>" the creator
-- already has, so a re-run can't produce a duplicate.
WITH existing AS (
    SELECT "creator_id", MAX(substring("name" from '^ai-video-([0-9]{1,15})$')::bigint) AS highest
    FROM "AiVideo"
    WHERE "name" ~ '^ai-video-[0-9]{1,15}$'
    GROUP BY "creator_id"
),
unnamed AS (
    SELECT
        "id",
        "creator_id",
        ROW_NUMBER() OVER (
            PARTITION BY "creator_id"
            ORDER BY COALESCE("generated_time", "created_at"), "id"
        ) AS position
    FROM "AiVideo"
    WHERE "name" IS NULL
)
UPDATE "AiVideo" AS video
SET "name" = 'ai-video-' || (unnamed.position + COALESCE(existing.highest, 0))
FROM unnamed
LEFT JOIN existing ON existing."creator_id" IS NOT DISTINCT FROM unnamed."creator_id"
WHERE video."id" = unnamed."id";

-- A creator can't have two videos with the same name.
CREATE UNIQUE INDEX IF NOT EXISTS "AiVideo_creator_id_name_key" ON "AiVideo"("creator_id", "name");
