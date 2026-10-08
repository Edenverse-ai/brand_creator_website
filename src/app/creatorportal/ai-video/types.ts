export type VideoStatus = "ready" | "expired";

export type AiVideoRecord = {
  id: string;
  creatorId: string;
  generatedAt: string;
  expiresAt: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  name: string;
  /** Prompt the video was generated from; absent for videos that weren't generated here. */
  prompt?: string | null;
  /** Model and settings, e.g. "Seedance 2.5 · 9:16 · 720p · 5s". */
  format?: string | null;
  tags: string[];
  status: VideoStatus;
};

export type TikTokBindingInfo = {
  displayName?: string;
  handle?: string;
  openId?: string;
  avatarUrl?: string | null;
  accessToken?: string;
};
