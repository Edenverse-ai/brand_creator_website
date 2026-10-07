export type VideoStatus = "ready" | "expired";

export type AiVideoRecord = {
  id: string;
  creatorId: string;
  generatedAt: string;
  expiresAt: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  /** Prompt the video was generated from, shown as its name. */
  prompt?: string | null;
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
