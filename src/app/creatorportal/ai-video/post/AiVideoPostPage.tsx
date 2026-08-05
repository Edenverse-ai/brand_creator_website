"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle, Info, RefreshCw, Upload, X } from "lucide-react";
import { AiVideoRecord, TikTokBindingInfo } from "../types";
import { extractErrorMessage } from "./error-message";

type CreatorInfoData = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
  creator_can_post?: boolean;
  can_post?: boolean;
  creator_can_publish?: boolean;
  can_publish?: boolean;
};

type CreatorInfoResponse = {
  data?: CreatorInfoData;
  error?: { code?: string; message?: string; log_id?: string };
};

type UploadStatus = "uploading" | "checking" | "success" | "error";

type Props = {
  videos: AiVideoRecord[];
  tikTokBinding: TikTokBindingInfo | null;
  uploadEndpoint: string;
  statusEndpoint: string;
};

const durationFormatter = (value: number | null | undefined) => {
  if (!value && value !== 0) return "--";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const formatPrivacyLabel = (value: string) => {
  switch (value) {
    case "PUBLIC_TO_EVERYONE":
      return "Public";
    case "MUTUAL_FOLLOW_FRIENDS":
      return "Friends (mutual follows)";
    case "FOLLOWER_OF_CREATOR":
      return "Followers";
    case "SELF_ONLY":
      return "Only me";
    default:
      return value
        .toLowerCase()
        .split("_")
        .map((chunk) => (chunk ? `${chunk[0].toUpperCase()}${chunk.slice(1)}` : chunk))
        .join(" ");
  }
};

const formatPublishStatus = (value?: string | null) => {
  if (!value) {
    return "Checking TikTok publish status";
  }

  const normalized = value.toUpperCase();
  const mapping: Record<string, string> = {
    PUBLISH_COMPLETE: "Published",
    PUBLISHING: "Publishing",
    PROCESSING: "Processing",
    REVIEWING: "Reviewing",
    SUCCESS: "Published",
    PUBLISHED: "Published",
    COMPLETED: "Published",
    FAILED: "Failed",
  };

  if (mapping[normalized]) {
    return mapping[normalized];
  }

  return value
    .toLowerCase()
    .split("_")
    .map((chunk) => (chunk ? `${chunk[0].toUpperCase()}${chunk.slice(1)}` : chunk))
    .join(" ");
};

const uploadStatusMeta = (status?: UploadStatus) => {
  if (status === "uploading") {
    return { label: "Uploading", tone: "text-indigo-600", icon: RefreshCw, spin: true };
  }
  if (status === "checking") {
    return {
      label: "Checking TikTok status",
      tone: "text-indigo-600",
      icon: RefreshCw,
      spin: true,
    };
  }
  if (status === "success") {
    return { label: "Published", tone: "text-emerald-600", icon: CheckCircle, spin: false };
  }
  return { label: "Failed", tone: "text-rose-600", icon: AlertTriangle, spin: false };
};

const statusBadge = (status?: UploadStatus) => {
  if (!status) return null;
  if (status === "uploading" || status === "checking") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
        {status === "uploading" ? "Uploading" : "Checking"}
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle className="h-3.5 w-3.5" />
        Published
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
      <X className="h-3.5 w-3.5" />
      Failed
    </span>
  );
};

export default function AiVideoPostPage({
  videos,
  tikTokBinding,
  uploadEndpoint,
  statusEndpoint,
}: Props) {
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfoResponse | null>(null);
  const [creatorInfoStatus, setCreatorInfoStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [creatorInfoMessage, setCreatorInfoMessage] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercialDisclosure, setCommercialDisclosure] = useState(false);
  const [promoteSelf, setPromoteSelf] = useState(false);
  const [promoteBrand, setPromoteBrand] = useState(false);
  const [uploadConsent, setUploadConsent] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, UploadStatus>>({});
  const [uploadStatusDetails, setUploadStatusDetails] = useState<Record<string, string>>({});
  const [publishIds, setPublishIds] = useState<Record<string, string>>({});
  const [videoDurations, setVideoDurations] = useState<Record<string, number | null>>({});
  const [isUploading, setIsUploading] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const hasTikTokBinding = Boolean(tikTokBinding);
  const tikTokAccessToken = tikTokBinding?.accessToken;

  const creatorData = creatorInfo?.data;
  const creatorNickname =
    creatorData?.creator_nickname || creatorData?.creator_username || tikTokBinding?.displayName;
  const maxDuration = creatorData?.max_video_post_duration_sec;
  // Pre-existing (unrelated to this task): privacyOptions is recreated every render, which
  // exhaustive-deps flags for the useEffect below that reads it. Not touched by this change --
  // see docs/harness.md's Layer 2 friction note for the accepted in-place suppression convention.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const privacyOptions = creatorData?.privacy_level_options ?? [];
  const disableCommentToggle = Boolean(creatorData?.comment_disabled);
  const disableDuetToggle = Boolean(creatorData?.duet_disabled);
  const disableStitchToggle = Boolean(creatorData?.stitch_disabled);
  const primaryVideo = videos[0] ?? null;
  const isPhotoPost = useMemo(() => {
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!primaryVideo?.videoUrl) return false;
    const url = primaryVideo.videoUrl.toLowerCase();
    return imageExtensions.some((ext) => url.includes(ext));
  }, [primaryVideo]);
  const privateOption = "SELF_ONLY";
  const brandedContentRequiresPublic = commercialDisclosure && promoteBrand;
  const brandedContentBlocksPrivate =
    brandedContentRequiresPublic && privacyOptions.includes(privateOption);
  const disclosureSelectionMissing = commercialDisclosure && !promoteSelf && !promoteBrand;
  const disclosureLabel = promoteBrand
    ? "Your photo/video will be labeled as 'Paid partnership'"
    : promoteSelf
      ? "Your photo/video will be labeled as 'Promotional content'"
      : "";
  const musicUsageConfirmationLink = (
    <a
      href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-indigo-600 hover:text-indigo-500"
    >
      TikTok&apos;s Music Usage Confirmation
    </a>
  );
  const brandedContentPolicyLink = (
    <a
      href="https://www.tiktok.com/legal/page/global/bc-policy/en"
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-indigo-600 hover:text-indigo-500"
    >
      TikTok&apos;s Branded Content Policy
    </a>
  );
  const complianceDeclaration = commercialDisclosure ? (
    promoteBrand ? (
      <>
        By posting, you agree to {brandedContentPolicyLink} and {musicUsageConfirmationLink}.
      </>
    ) : promoteSelf ? (
      <>By posting, you agree to {musicUsageConfirmationLink}.</>
    ) : (
      <>By posting, you agree to {musicUsageConfirmationLink}.</>
    )
  ) : (
    <>By posting, you agree to {musicUsageConfirmationLink}.</>
  );
  const canPostNow = useMemo(() => {
    const flags = [
      creatorData?.creator_can_post,
      creatorData?.can_post,
      creatorData?.creator_can_publish,
      creatorData?.can_publish,
    ];
    if (flags.some((flag) => flag === false)) {
      return false;
    }
    if (flags.some((flag) => flag === true)) {
      return true;
    }
    return true;
  }, [creatorData]);

  useEffect(() => {
    if (!tikTokAccessToken) return;
    let isMounted = true;
    const loadCreatorInfo = async () => {
      setCreatorInfoStatus("loading");
      setCreatorInfoMessage(null);
      try {
        const response = await fetch("/api/tiktok/creator-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: tikTokAccessToken }),
        });
        const payload = (await response.json().catch(() => null)) as CreatorInfoResponse | null;
        if (!response.ok || !payload) {
          throw new Error(payload?.error?.message || "Unable to load creator info.");
        }
        if (payload?.error?.code && payload.error.code !== "ok") {
          throw new Error(payload.error.message || "TikTok creator info error.");
        }
        if (isMounted) {
          setCreatorInfo(payload);
          setCreatorInfoStatus("success");
          if (payload.data?.comment_disabled) {
            setAllowComment(false);
          }
          if (payload.data?.duet_disabled) {
            setAllowDuet(false);
          }
          if (payload.data?.stitch_disabled) {
            setAllowStitch(false);
          }
        }
      } catch (error) {
        if (isMounted) {
          setCreatorInfoStatus("error");
          setCreatorInfoMessage(
            error instanceof Error ? error.message : "Unable to load creator info."
          );
        }
      }
    };

    loadCreatorInfo();
    return () => {
      isMounted = false;
    };
  }, [tikTokAccessToken]);

  useEffect(() => {
    let cancelled = false;
    const loadDurations = async () => {
      const nextDurations: Record<string, number | null> = {};
      if (!primaryVideo?.videoUrl) return;
      try {
        const duration = await new Promise<number>((resolve, reject) => {
          const el = document.createElement("video");
          el.preload = "metadata";
          el.crossOrigin = "anonymous";
          el.onloadedmetadata = () => resolve(el.duration);
          el.onerror = () => reject(new Error("Unable to load metadata"));
          el.src = primaryVideo.videoUrl as string;
        });
        nextDurations[primaryVideo.id] = duration;
      } catch {
        nextDurations[primaryVideo?.id ?? ""] = null;
      }

      if (cancelled) return;
      setVideoDurations((prev) => ({ ...prev, ...nextDurations }));
    };

    loadDurations();
    return () => {
      cancelled = true;
    };
  }, [primaryVideo]);

  const durationViolations = useMemo(() => {
    if (!maxDuration) return [];
    if (!primaryVideo) return [];
    const duration = videoDurations[primaryVideo.id];
    return typeof duration === "number" && duration > maxDuration ? [primaryVideo] : [];
  }, [maxDuration, primaryVideo, videoDurations]);

  const hasUnknownDurations = useMemo(() => {
    if (!maxDuration) return false;
    if (!primaryVideo?.videoUrl) return false;
    return videoDurations[primaryVideo.id] == null;
  }, [maxDuration, primaryVideo, videoDurations]);

  const canSubmit =
    hasTikTokBinding &&
    Boolean(tikTokAccessToken) &&
    creatorInfoStatus === "success" &&
    canPostNow &&
    Boolean(privacyLevel) &&
    privacyOptions.includes(privacyLevel) &&
    Boolean(privacyOptions.length) &&
    !disclosureSelectionMissing &&
    uploadConsent &&
    !durationViolations.length &&
    !hasUnknownDurations &&
    Boolean(primaryVideo);

  const handleUpload = async () => {
    setUploadMessage(null);
    if (!primaryVideo) {
      setUploadMessage("No video selected. Return to the AI video queue to choose a clip.");
      return;
    }
    if (!tikTokAccessToken) {
      setUploadMessage(
        "TikTok account is connected but missing an access token. Please reconnect TikTok."
      );
      return;
    }
    if (creatorInfoStatus !== "success") {
      setUploadMessage("Please refresh creator info before posting.");
      return;
    }
    if (!privacyOptions.length) {
      setUploadMessage("Privacy options are unavailable. Refresh creator info and try again.");
      return;
    }
    if (!privacyLevel || !privacyOptions.includes(privacyLevel)) {
      setUploadMessage("Select a TikTok privacy level before posting.");
      return;
    }
    if (disclosureSelectionMissing) {
      setUploadMessage("Select your commercial content disclosure options before posting.");
      return;
    }
    if (!uploadConsent) {
      setUploadMessage("Please confirm you consent to uploading this content to TikTok.");
      return;
    }
    if (!canPostNow) {
      setUploadMessage(
        "TikTok is not accepting new posts for this creator right now. Try again later."
      );
      return;
    }
    if (maxDuration && hasUnknownDurations) {
      setUploadMessage("Unable to verify video duration. Refresh the page and try again.");
      return;
    }
    if (durationViolations.length) {
      setUploadMessage(
        `One or more videos exceed the max duration of ${maxDuration}s. Remove or regenerate those clips.`
      );
      return;
    }

    setIsUploading(true);
    setUploadStatuses({ [primaryVideo.id]: "uploading" as const });
    setUploadStatusDetails({});
    setPublishIds({});

    try {
      const response = await fetch(uploadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: tikTokAccessToken,
          videos: [
            {
              id: primaryVideo.id,
              videoUrl: primaryVideo.videoUrl,
              title:
                title.trim() ||
                (primaryVideo.tags?.[0] ? `AI video - ${primaryVideo.tags[0]}` : "AI video upload"),
              privacyLevel,
              brandContent: commercialDisclosure ? promoteBrand : false,
              brandOrganic: commercialDisclosure ? promoteSelf : false,
              disableComment: disableCommentToggle || !allowComment,
              disableDuet: isPhotoPost ? true : disableDuetToggle || !allowDuet,
              disableStitch: isPhotoPost ? true : disableStitchToggle || !allowStitch,
            },
          ],
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUploadMessage(payload.error || "TikTok upload failed.");
        setUploadStatuses({ [primaryVideo.id]: "error" as const });
        return;
      }

      const results = Array.isArray(payload.results) ? payload.results : [];
      const nextStatuses: Record<string, UploadStatus> = {};
      const nextDetails: Record<string, string> = {};
      const nextPublishIds: Record<string, string> = {};

      results.forEach((result: any) => {
        if (!result?.id) return;
        if (result.status !== "ok") {
          nextStatuses[result.id] = "error";
          nextDetails[result.id] = extractErrorMessage(result.error, "Upload failed");
          return;
        }

        if (result.publish_id) {
          nextPublishIds[result.id] = result.publish_id;
        }
        const publishStatus = result.publish_status?.data?.status;
        if (typeof publishStatus === "string") {
          const normalized = publishStatus.toUpperCase();
          if (
            normalized === "SUCCESS" ||
            normalized === "PUBLISHED" ||
            normalized === "COMPLETED"
          ) {
            nextStatuses[result.id] = "success";
          } else if (normalized === "FAILED") {
            nextStatuses[result.id] = "error";
          } else {
            nextStatuses[result.id] = "checking";
          }
          nextDetails[result.id] = formatPublishStatus(publishStatus);
        } else {
          nextStatuses[result.id] = "checking";
          nextDetails[result.id] = formatPublishStatus(null);
        }
      });

      setUploadStatuses((prev) => ({ ...prev, ...nextStatuses }));
      setUploadStatusDetails((prev) => ({ ...prev, ...nextDetails }));
      setPublishIds((prev) => ({ ...prev, ...nextPublishIds }));
    } catch (error) {
      console.error("TikTok upload error", error);
      setUploadMessage("Unexpected error uploading to TikTok.");
      setUploadStatuses({ [primaryVideo.id]: "error" as const });
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!tikTokAccessToken) return;
    const pending = Object.entries(uploadStatuses)
      .filter(([, status]) => status === "checking")
      .map(([videoId]) => ({ videoId, publishId: publishIds[videoId] }))
      .filter((item) => Boolean(item.publishId));

    if (!pending.length) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const publishIdList = pending.map((p) => p.publishId);
        const response = await fetch(statusEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: tikTokAccessToken,
            publish_ids: publishIdList,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        const results = Array.isArray(payload.results) ? payload.results : [];

        const nextStatuses: Record<string, UploadStatus> = {};
        const nextDetails: Record<string, string> = {};

        results.forEach((result: any) => {
          const publishId = result.publish_id;
          if (!publishId) return;
          const videoEntry = pending.find((p) => p.publishId === publishId);
          if (!videoEntry) return;
          const videoId = videoEntry.videoId;
          if (result.status !== "ok") {
            nextStatuses[videoId] = "error";
            nextDetails[videoId] = extractErrorMessage(result.error, "Status check failed");
            return;
          }
          const status = result.payload?.data?.status;
          const failReason = result.payload?.data?.fail_reason;
          const normalized = typeof status === "string" ? status.toUpperCase() : "";
          if (
            normalized === "PUBLISH_COMPLETE" ||
            normalized === "SUCCESS" ||
            normalized === "PUBLISHED"
          ) {
            nextStatuses[videoId] = "success";
            nextDetails[videoId] = formatPublishStatus(status);
          } else if (normalized === "FAILED") {
            nextStatuses[videoId] = "error";
            nextDetails[videoId] = failReason || "Publish failed";
          } else {
            nextStatuses[videoId] = "checking";
            nextDetails[videoId] = formatPublishStatus(status);
          }
        });

        if (Object.keys(nextStatuses).length) {
          setUploadStatuses((prev) => ({ ...prev, ...nextStatuses }));
          setUploadStatusDetails((prev) => ({ ...prev, ...nextDetails }));
        }
      } catch (error) {
        console.error("Polling TikTok status failed", error);
      }
    };

    if (!pollingRef.current) {
      poll();
      pollingRef.current = setInterval(poll, 5000);
    }
  }, [uploadStatuses, publishIds, tikTokAccessToken, statusEndpoint]);

  const refreshCreatorInfo = async () => {
    if (!tikTokAccessToken) return;
    setCreatorInfoStatus("loading");
    setCreatorInfoMessage(null);
    try {
      const response = await fetch("/api/tiktok/creator-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: tikTokAccessToken }),
      });
      const payload = (await response.json().catch(() => null)) as CreatorInfoResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error?.message || "Unable to refresh creator info.");
      }
      if (payload?.error?.code && payload.error.code !== "ok") {
        throw new Error(payload.error.message || "TikTok creator info error.");
      }
      setCreatorInfo(payload);
      setCreatorInfoStatus("success");
      if (payload.data?.comment_disabled) {
        setAllowComment(false);
      }
      if (payload.data?.duet_disabled) {
        setAllowDuet(false);
      }
      if (payload.data?.stitch_disabled) {
        setAllowStitch(false);
      }
    } catch (error) {
      setCreatorInfoStatus("error");
      setCreatorInfoMessage(
        error instanceof Error ? error.message : "Unable to refresh creator info."
      );
    }
  };

  useEffect(() => {
    if (disableCommentToggle) {
      setAllowComment(false);
    }
  }, [disableCommentToggle]);

  useEffect(() => {
    if (disableDuetToggle) {
      setAllowDuet(false);
    }
  }, [disableDuetToggle]);

  useEffect(() => {
    if (disableStitchToggle) {
      setAllowStitch(false);
    }
  }, [disableStitchToggle]);

  useEffect(() => {
    if (isPhotoPost) {
      setAllowDuet(false);
      setAllowStitch(false);
    }
  }, [isPhotoPost]);

  useEffect(() => {
    if (!commercialDisclosure) {
      setPromoteSelf(false);
      setPromoteBrand(false);
    }
  }, [commercialDisclosure]);

  useEffect(() => {
    if (brandedContentRequiresPublic && privacyLevel === privateOption) {
      const fallback = privacyOptions.find((option) => option !== privateOption);
      setPrivacyLevel(fallback ?? "");
    }
  }, [brandedContentRequiresPublic, privacyLevel, privacyOptions]);

  return (
    <div className="space-y-8 py-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/creatorportal/ai-video"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to AI video queue
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500">Post to TikTok</p>
            <h1 className="text-3xl font-semibold text-slate-900">Confirm upload settings</h1>
            <p className="text-sm text-slate-600">
              Review creator limits and upload settings before publishing to TikTok.
            </p>
          </div>
          {hasTikTokBinding && (
            <button
              type="button"
              onClick={refreshCreatorInfo}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300"
              disabled={creatorInfoStatus === "loading"}
            >
              <RefreshCw
                className={`h-4 w-4 ${creatorInfoStatus === "loading" ? "animate-spin" : ""}`}
              />
              Refresh creator info
            </button>
          )}
        </div>
      </div>

      {!primaryVideo && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-sm text-slate-500">
          No video selected for posting. Return to the AI video queue to choose a clip.
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Creator info
              </p>
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                {creatorData?.creator_avatar_url ? (
                  // Pre-existing (unrelated to this task): avatar URL is a TikTok-hosted CDN URL
                  // with a varying host; skip next/image to avoid an allow-list dependency (same
                  // rationale as AiVideoDashboard.tsx's thumbnail <img>).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={creatorData.creator_avatar_url}
                    alt={creatorNickname || "TikTok creator avatar"}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    {creatorNickname?.[0]?.toUpperCase() ?? "T"}
                  </span>
                )}
                <span>
                  {creatorNickname ? `Posting as ${creatorNickname}` : "TikTok creator unavailable"}
                </span>
              </div>
              {creatorData?.creator_username && (
                <p className="text-xs text-slate-500">@{creatorData.creator_username}</p>
              )}
            </div>
            <div className="rounded-full bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
              {creatorInfoStatus === "loading" && "Fetching latest creator info..."}
              {creatorInfoStatus === "success" && "Creator info synced"}
              {creatorInfoStatus === "error" && "Creator info unavailable"}
            </div>
          </div>

          {creatorInfoMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>{creatorInfoMessage}</span>
            </div>
          )}

          {!canPostNow && creatorInfoStatus === "success" && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>TikTok is limiting new posts for this creator right now. Try again later.</span>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Upload settings
              </p>
              <h2 className="text-lg font-semibold text-slate-900">TikTok publish configuration</h2>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Privacy:{" "}
              <span className="text-slate-900">
                {privacyLevel ? formatPrivacyLabel(privacyLevel) : "Select a value"}
              </span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Title</p>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add a title for TikTok"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                maxLength={150}
              />
              <p className="mt-1 text-xs text-slate-500">
                Optional. TikTok allows up to 150 characters.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Privacy status</p>
              <select
                value={privacyLevel}
                onChange={(event) => setPrivacyLevel(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={!privacyOptions.length}
                title={
                  brandedContentBlocksPrivate
                    ? "Branded content visibility cannot be set to private."
                    : ""
                }
              >
                <option value="" disabled>
                  Select privacy level
                </option>
                {privacyOptions.map((option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={option === privateOption && brandedContentBlocksPrivate}
                    title={
                      option === privateOption && brandedContentBlocksPrivate
                        ? "Branded content visibility cannot be set to private."
                        : undefined
                    }
                  >
                    {option === privateOption && brandedContentBlocksPrivate
                      ? `${formatPrivacyLabel(option)} (not available)`
                      : formatPrivacyLabel(option)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Options match the creator info from TikTok.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Creator limits</p>
              <p className="mt-1 font-semibold text-slate-900">
                Max duration {maxDuration ? `${maxDuration}s` : "Unknown"}
              </p>
              <p className="text-xs text-slate-500">
                {maxDuration
                  ? "Validated against TikTok creator settings."
                  : "Refresh creator info to validate."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Commercial content
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={commercialDisclosure}
                  onChange={(event) => setCommercialDisclosure(event.target.checked)}
                />
                Disclose commercial content
              </label>
              {commercialDisclosure && (
                <div className="mt-3 space-y-2 text-sm">
                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={promoteSelf}
                      onChange={(event) => setPromoteSelf(event.target.checked)}
                    />
                    Your brand
                  </label>
                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={promoteBrand}
                      onChange={(event) => setPromoteBrand(event.target.checked)}
                    />
                    Branded content
                  </label>
                  {disclosureLabel && (
                    <p className="text-xs font-semibold text-slate-500">{disclosureLabel}</p>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Interaction ability
              </p>
              <div className="mt-2 space-y-2 text-sm">
                <label
                  className={`flex items-center gap-2 ${disableCommentToggle ? "text-slate-400" : "text-slate-700"}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={allowComment}
                    onChange={(event) => setAllowComment(event.target.checked)}
                    disabled={disableCommentToggle}
                  />
                  Allow Comment {disableCommentToggle && "(disabled in TikTok settings)"}
                </label>
                {!isPhotoPost && (
                  <label
                    className={`flex items-center gap-2 ${disableDuetToggle ? "text-slate-400" : "text-slate-700"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={allowDuet}
                      onChange={(event) => setAllowDuet(event.target.checked)}
                      disabled={disableDuetToggle}
                    />
                    Allow Duet {disableDuetToggle && "(disabled in TikTok settings)"}
                  </label>
                )}
                {!isPhotoPost && (
                  <label
                    className={`flex items-center gap-2 ${disableStitchToggle ? "text-slate-400" : "text-slate-700"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={allowStitch}
                      onChange={(event) => setAllowStitch(event.target.checked)}
                      disabled={disableStitchToggle}
                    />
                    Allow Stitch {disableStitchToggle && "(disabled in TikTok settings)"}
                  </label>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Privacy options</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {creatorData?.privacy_level_options?.length
                  ? creatorData.privacy_level_options.map(formatPrivacyLabel).join(", ")
                  : "Not loaded"}
              </p>
              <p className="text-xs text-slate-500">Must match creator info from TikTok.</p>
              {brandedContentBlocksPrivate && (
                <p className="mt-2 text-xs font-semibold text-rose-600">
                  Branded content visibility cannot be set to private.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Selected video
              </p>
              <h2 className="text-lg font-semibold text-slate-900">Clip ready to publish</h2>
            </div>
            <p className="text-sm font-semibold text-slate-500">Single upload</p>
          </div>
          <div className="mt-4 space-y-3">
            {primaryVideo &&
              (() => {
                const duration = videoDurations[primaryVideo.id];
                const exceedsMax =
                  maxDuration && typeof duration === "number" && duration > maxDuration;
                return (
                  <div
                    key={primaryVideo.id}
                    className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {primaryVideo.thumbnailUrl ? (
                        // Pre-existing (unrelated to this task): thumbnailUrl is a signed Supabase
                        // storage URL whose host varies per env; skip next/image to avoid an
                        // allow-list dependency (same rationale as AiVideoDashboard.tsx).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={primaryVideo.thumbnailUrl}
                          alt={`Thumbnail for ${primaryVideo.id}`}
                          className="h-16 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-12 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500">
                          {primaryVideo.id.slice(0, 3)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {primaryVideo.tags?.[0]
                            ? `AI video - ${primaryVideo.tags[0]}`
                            : "AI video upload"}
                        </p>
                        <p className="text-xs text-slate-500">{primaryVideo.id}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        Duration {durationFormatter(duration)}
                      </span>
                      {exceedsMax && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Exceeds limit
                        </span>
                      )}
                      {statusBadge(uploadStatuses[primaryVideo.id])}
                    </div>
                  </div>
                );
              })()}
          </div>
          {primaryVideo?.videoUrl && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
              {isPhotoPost ? (
                // Pre-existing (unrelated to this task): videoUrl is a signed Supabase storage URL
                // whose host varies per env; skip next/image to avoid an allow-list dependency
                // (same rationale as AiVideoDashboard.tsx).
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryVideo.videoUrl}
                  alt="Preview of selected content"
                  className="w-full object-contain"
                />
              ) : (
                <video
                  src={primaryVideo.videoUrl}
                  controls
                  playsInline
                  className="w-full max-h-[70vh] bg-black object-contain"
                />
              )}
            </div>
          )}

          {(durationViolations.length > 0 || hasUnknownDurations) && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {hasUnknownDurations
                ? "Unable to verify video duration. Please refresh and try again."
                : `One or more videos exceed the ${maxDuration}s limit.`}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Publish action
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={uploadConsent}
              onChange={(event) => setUploadConsent(event.target.checked)}
            />
            I consent to uploading this content to TikTok.
          </label>
          <span
            className="mt-4 block"
            title={
              disclosureSelectionMissing
                ? "You need to indicate if your content promotes yourself, a third party, or both."
                : !uploadConsent
                  ? "Please confirm you consent to upload this content."
                  : ""
            }
          >
            <button
              type="button"
              onClick={handleUpload}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              disabled={!canSubmit || isUploading}
            >
              <Upload className="h-4 w-4" />
              {isUploading ? "Uploading..." : "Confirm & post to TikTok"}
            </button>
          </span>
          {!hasTikTokBinding && (
            <p className="mt-3 text-xs text-slate-500">Connect a TikTok account before posting.</p>
          )}
          {uploadMessage && (
            <p className="mt-3 text-sm font-medium text-slate-600">{uploadMessage}</p>
          )}
          {complianceDeclaration && (
            <p className="mt-3 text-xs text-slate-500">{complianceDeclaration}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            After publishing, TikTok may take a few minutes to process and show the post on your
            profile.
          </p>
        </div>

        {Boolean(Object.keys(uploadStatuses).length) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <Info className="h-4 w-4 text-indigo-500" />
              Upload status
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {Object.entries(uploadStatuses).map(([videoId, status]) => {
                const meta = uploadStatusMeta(status);
                const detail = uploadStatusDetails[videoId];
                const Icon = meta.icon;
                return (
                  <div
                    key={videoId}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-xs"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                      <Icon className={`h-5 w-5 ${meta.tone}${meta.spin ? " animate-spin" : ""}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                      <p className="text-xs text-slate-500">
                        {detail || formatPublishStatus(null)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      {primaryVideo?.id === videoId ? "Primary video" : videoId}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
