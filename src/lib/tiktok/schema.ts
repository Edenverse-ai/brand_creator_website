import { z } from "zod";

/**
 * Wire contract for POST /api/tiktok/publish and POST /api/tiktok/publish-status.
 *
 * Field names match backend/app/main/routes/tiktok_upload.py's UploadVideo /
 * UploadRequest / PublishStatusRequest Pydantic models by field name (Pydantic's
 * `populate_by_name=True` there accepts either the camelCase alias or these
 * snake_case names; this is the shape documented as this route's contract in
 * .superpowers/sdd/task-3.2-brief.md). The live client
 * (src/app/creatorportal/ai-video/post/AiVideoPostPage.tsx) currently calls the
 * FastAPI route with the camelCase aliases -- that page is NOT flipped to these
 * routes in this change, so the mismatch is a follow-up concern, not a bug here.
 *
 * `privacy_level` and `id` are optional at the schema level (matching the
 * Python model, where they're `str | None`) -- a missing privacy_level is a
 * PER-VIDEO error (see processVideo in the publish route), not a whole-request
 * 400, matching the Python's per-video error isolation.
 */
export const VideoInputSchema = z.object({
  id: z.string().optional(),
  video_url: z.string().url().optional(),
  video_path: z.string().optional(),
  title: z.string().optional(),
  privacy_level: z.string().optional(),
  disable_comment: z.boolean().optional(),
  disable_duet: z.boolean().optional(),
  disable_stitch: z.boolean().optional(),
  brand_content_toggle: z.boolean().optional(),
  brand_organic_toggle: z.boolean().optional(),
});

export const PublishRequestSchema = z.object({
  access_token: z.string().min(1),
  videos: z.array(VideoInputSchema).min(1),
});

export const PublishStatusRequestSchema = z.object({
  access_token: z.string().min(1),
  publish_ids: z.array(z.string().min(1)).default([]),
});

export type VideoInput = z.infer<typeof VideoInputSchema>;
export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type PublishStatusRequest = z.infer<typeof PublishStatusRequestSchema>;
