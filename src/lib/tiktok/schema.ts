import { z } from "zod";

/**
 * Wire contract for POST /api/tiktok/publish and POST /api/tiktok/publish-status.
 *
 * Field names match backend/app/main/routes/tiktok_upload.py's UploadVideo /
 * UploadRequest / PublishStatusRequest Pydantic models: that Pydantic model has
 * BOTH a snake_case field name and a camelCase alias, with `populate_by_name`
 * true, so the Python genuinely accepts either spelling on the wire. The live
 * client (src/app/creatorportal/ai-video/post/AiVideoPostPage.tsx) calls the
 * FastAPI route with the camelCase aliases today.
 *
 * POST-REVIEW FIX: the first version of this schema only declared the
 * snake_case names. zod's default `z.object()` behavior SILENTLY STRIPS
 * unrecognized keys rather than rejecting them, so a camelCase body parsed
 * "successfully" with every meaningful field dropped -- producing a bogus
 * "Missing privacy_level" per-video error instead of surfacing the real
 * problem. Both spellings are now accepted and coalesced onto the canonical
 * snake_case shape below, so this is a genuine superset-compatible port
 * regardless of which casing a caller uses.
 *
 * `privacy_level` and `id` are optional at the schema level (matching the
 * Python model, where they're `str | None`) -- a missing privacy_level is a
 * PER-VIDEO error (see processVideo in the publish route), not a whole-request
 * 400, matching the Python's per-video error isolation.
 *
 * URL fields are restricted to `https:` only. POST-REVIEW FIX: plain
 * `z.string().url()` in zod 4.4.3 accepts `ftp://`, `file://`, and even
 * `javascript:` (verified empirically) -- unlike Python's `HttpUrl`, which
 * restricts to http/https. `z.url({ protocol: /^https$/ })` closes that gap;
 * http is excluded too since every legitimate source in this system (Supabase
 * signed URLs, real video CDNs, TikTok's own endpoints) is https-only.
 */
const httpsUrl = () => z.url({ protocol: /^https$/ });

const VideoInputWireSchema = z.object({
  id: z.string().optional(),
  video_url: httpsUrl().optional(),
  videoUrl: httpsUrl().optional(),
  video_path: z.string().optional(),
  videoPath: z.string().optional(),
  title: z.string().optional(),
  privacy_level: z.string().optional(),
  privacyLevel: z.string().optional(),
  disable_comment: z.boolean().optional(),
  disableComment: z.boolean().optional(),
  disable_duet: z.boolean().optional(),
  disableDuet: z.boolean().optional(),
  disable_stitch: z.boolean().optional(),
  disableStitch: z.boolean().optional(),
  brand_content_toggle: z.boolean().optional(),
  brandContent: z.boolean().optional(),
  brand_organic_toggle: z.boolean().optional(),
  brandOrganic: z.boolean().optional(),
});

export const VideoInputSchema = VideoInputWireSchema.transform((v) => ({
  id: v.id,
  video_url: v.video_url ?? v.videoUrl,
  video_path: v.video_path ?? v.videoPath,
  title: v.title,
  privacy_level: v.privacy_level ?? v.privacyLevel,
  disable_comment: v.disable_comment ?? v.disableComment,
  disable_duet: v.disable_duet ?? v.disableDuet,
  disable_stitch: v.disable_stitch ?? v.disableStitch,
  brand_content_toggle: v.brand_content_toggle ?? v.brandContent,
  brand_organic_toggle: v.brand_organic_toggle ?? v.brandOrganic,
}));

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
