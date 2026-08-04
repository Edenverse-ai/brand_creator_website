import { prisma } from "@/lib/prisma";
import { getAiVideoLibrary, type AiVideoLibraryItemResponse } from "@/lib/ai-video-library";
import { AiVideoRecord, TikTokBindingInfo, VideoStatus } from "./types";

const TIKTOK_TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";

type TikTokUserProfile = {
  displayName?: string;
  avatarUrl?: string;
  username?: string;
  openId?: string;
  followerCount?: number;
};

type TikTokAccountRecord = Awaited<ReturnType<typeof prisma.tikTokAccount.findUnique>>;
type TikTokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  open_id?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  error?: string;
  error_description?: string;
  message?: string;
};

/**
 * Ported off the FastAPI proxy (previously `fetch(CAMPAIGNS_API_URL + "/ai-videos/library")`)
 * onto the native `GET /api/ai-videos/library` port -- see src/lib/ai-video-library.ts and
 * src/app/api/ai-videos/library/route.ts. Called directly rather than via HTTP self-fetch:
 * this function already runs server-side inside the Server Component render that resolved
 * `userId` from the session in the first place, so an HTTP round trip back into our own route
 * would just add latency and a fragile cookie-forwarding requirement for zero benefit -- see
 * task-4f-report.md for the full reasoning. A null/absent userId (no session) returns an empty
 * list without touching the database, matching the route's own 401-if-unauthenticated posture.
 */
export async function fetchAiVideos(userId: string | null): Promise<AiVideoRecord[]> {
  if (!userId) return [];
  try {
    const payload = await getAiVideoLibrary(userId);
    return payload.map(mapToRecord);
  } catch (error) {
    console.error("Unable to load AI videos", error instanceof Error ? error.name : typeof error);
    return [];
  }
}

function mapToRecord(item: AiVideoLibraryItemResponse): AiVideoRecord {
  const expiresAt = new Date(
    new Date(item.generated_time).getTime() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const status: VideoStatus = new Date(expiresAt).getTime() < Date.now() ? "expired" : "ready";

  return {
    id: item.id,
    creatorId: item.creator_id,
    generatedAt: item.generated_time,
    expiresAt,
    videoUrl: item.video_url,
    thumbnailUrl: item.thumbnail_url,
    tags: item.tags,
    status,
  };
}

export async function refreshTikTokAccount(
  account: TikTokAccountRecord
): Promise<TikTokAccountRecord | null> {
  if (!account) {
    return null;
  }

  const now = Date.now();
  let nextAccount = account;
  if (account.refresh_expires_at.getTime() <= now) {
    await prisma.tikTokAccount.delete({
      where: { user_id: account.user_id },
    });
    return null;
  }

  if (account.expires_at.getTime() <= now) {
    if (!account.refresh_token) {
      console.error("TikTok access token expired without refresh token", {
        userId: account.user_id,
      });
      return account;
    }

    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
      console.error("TikTok token refresh skipped: missing client credentials", {
        hasClientKey: Boolean(clientKey),
        hasClientSecret: Boolean(clientSecret),
      });
      return account;
    }

    try {
      const params = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      });

      const response = await fetch(TIKTOK_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        cache: "no-store",
      });

      const payload = (await response.json()) as TikTokTokenResponse;
      if (!response.ok || payload.error) {
        console.error("TikTok token refresh failed", {
          status: response.status,
          error: payload.error,
          message: payload.error_description || payload.message,
        });
        return account;
      }

      const expiresAt = payload.expires_in
        ? new Date(now + payload.expires_in * 1000)
        : account.expires_at;
      const refreshExpiresAt = payload.refresh_expires_in
        ? new Date(now + payload.refresh_expires_in * 1000)
        : account.refresh_expires_at;

      nextAccount = await prisma.tikTokAccount.update({
        where: { user_id: account.user_id },
        data: {
          access_token: payload.access_token ?? account.access_token,
          refresh_token: payload.refresh_token ?? account.refresh_token,
          scope: payload.scope ?? account.scope,
          expires_at: expiresAt,
          refresh_expires_at: refreshExpiresAt,
          tiktok_open_id: payload.open_id ?? account.tiktok_open_id,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      console.error("TikTok token refresh error", error);
      return account;
    }
  }

  const profile = await fetchTikTokProfile(nextAccount.access_token);
  if (!profile) {
    return nextAccount;
  }

  return await prisma.tikTokAccount.update({
    where: { user_id: nextAccount.user_id },
    data: {
      handle: profile.username ?? profile.displayName ?? nextAccount.handle,
      display_name: profile.displayName ?? nextAccount.display_name,
      avatar_url: profile.avatarUrl ?? nextAccount.avatar_url,
      follower_count: profile.followerCount ?? nextAccount.follower_count,
      tiktok_open_id: profile.openId ?? nextAccount.tiktok_open_id,
      last_synced_at: new Date(),
      updated_at: new Date(),
    },
  });
}

export async function buildTikTokBinding(
  account: TikTokAccountRecord
): Promise<TikTokBindingInfo | null> {
  if (!account) {
    return null;
  }

  const existing: TikTokBindingInfo = {
    displayName: account.display_name ?? undefined,
    handle: account.handle ?? undefined,
    openId: account.tiktok_open_id,
    avatarUrl: account.avatar_url,
    accessToken: account.access_token,
  };

  if (existing.displayName || existing.handle) {
    return existing;
  }

  const profile = await fetchTikTokProfile(account.access_token);
  if (!profile) {
    return existing;
  }

  await prisma.tikTokAccount.update({
    where: { user_id: account.user_id },
    data: {
      display_name: profile.displayName ?? account.display_name,
      handle: profile.displayName ?? profile.username ?? account.handle,
      avatar_url: profile.avatarUrl ?? account.avatar_url,
      follower_count: profile.followerCount ?? account.follower_count,
      last_synced_at: new Date(),
    },
  });

  return {
    displayName: profile.displayName ?? existing.displayName,
    handle: profile.username ?? profile.displayName ?? existing.handle,
    openId: existing.openId,
    avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
    accessToken: existing.accessToken,
  };
}

async function fetchTikTokProfile(accessToken?: string): Promise<TikTokUserProfile | null> {
  if (!accessToken) return null;

  try {
    const requestedFields = ["open_id", "avatar_url", "display_name", "follower_count"];
    const url = `https://open.tiktokapis.com/v2/user/info/?fields=${requestedFields.join(",")}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Failed to fetch TikTok user info on dashboard render", {
        status: response.status,
        body,
        url,
        requestedFields,
      });
      return null;
    }

    const user = body?.data?.user ?? body?.data ?? null;
    if (!user) return null;

    return {
      displayName: user.display_name ?? user.displayName,
      avatarUrl: user.avatar_url ?? user.avatarUrl,
      username: user.username ?? user.handle ?? user.open_id,
      openId: user.open_id ?? user.openId,
      followerCount: user.follower_count ?? user.followerCount,
    };
  } catch (error) {
    console.error("Error fetching TikTok profile on dashboard render", error);
    return null;
  }
}
