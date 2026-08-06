"use client";

import Link from "next/link";
import Image from "next/image";
import { Lock } from "lucide-react";
import ErrorHandlingImage from "@/components/ui/ErrorHandlingImage";
import { RARITY_STYLES, formatCompact, rarityOf } from "./rarity";

type Lang = "en" | "zh";

export interface TradingCardCreator {
  id: string;
  name: string | null;
  handle: string | null;
  location: string | null;
  avatar: string | null;
  categories: string[];
  followers: number;
  engagementRate: number;
  medianViews: number;
  videosCount: number;
  /** Server-gated: present only for members. Never send this to non-members. */
  rate: string | null;
}

interface CreatorTradingCardProps {
  creator: TradingCardCreator;
  lang: Lang;
  isMember: boolean;
}

const COPY = {
  followers: { en: "Followers", zh: "粉丝" },
  engagement: { en: "Engagement", zh: "互动率" },
  medianViews: { en: "Median Views", zh: "中位播放" },
  videos: { en: "Videos", zh: "视频数" },
  rate: { en: "Creator Rate", zh: "合作报价" },
  membersOnly: { en: "Members only", zh: "会员可见" },
  viewProfile: { en: "View Profile", zh: "查看资料" },
} as const;

const HIGH_ENGAGEMENT_THRESHOLD = 5;
/** Placeholder shown to non-members — the real rate never reaches the client. */
const MASKED_RATE = "$0,000";

function StatCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="px-2 py-3 text-center" style={{ background: "rgba(15,23,42,0.55)" }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <div className="text-[18px] font-extrabold" style={{ color: valueColor ?? "#ffffff" }}>
        {value}
      </div>
    </div>
  );
}

export default function CreatorTradingCard({ creator, lang, isMember }: CreatorTradingCardProps) {
  const rarity = rarityOf(creator.followers);
  const style = RARITY_STYLES[rarity];
  const localePrefix = lang === "zh" ? "/zh" : "";
  const membershipHref = `${localePrefix}/membership`;
  const profileHref = `${localePrefix}/creator/${creator.id}`;
  const engagement = creator.engagementRate;

  return (
    <div
      className="rounded-[20px] p-0.5 transition-transform duration-300 hover:-translate-y-1.5"
      style={{ background: style.frame, boxShadow: style.glow }}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-[18px]"
        style={{
          background: "linear-gradient(165deg,#221139 0%,#131c31 55%,#0f172a 100%)",
        }}
      >
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
            style={{
              background:
                "radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.14), transparent 55%)",
            }}
            aria-hidden
          />

          <div className="relative flex items-center justify-between px-4 pt-3.5">
            <span
              className="rounded-full border px-2 py-1 text-[11px] font-extrabold tracking-[0.08em]"
              style={{ color: style.color, background: style.bg, borderColor: style.border }}
            >
              {rarity} · {style.word[lang]}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-200"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <Image
                src="/icons/tiktok.svg"
                alt=""
                width={12}
                height={12}
                className="brightness-0 invert"
                aria-hidden
              />
              TikTok
            </span>
          </div>

          <div className="relative flex flex-col items-center px-4 pb-5 pt-4 text-center">
            <div
              className="h-24 w-24 rounded-full p-[3px]"
              style={{ background: style.frame, boxSizing: "border-box" }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-full bg-slate-800">
                {creator.avatar ? (
                  <ErrorHandlingImage
                    src={creator.avatar}
                    alt={creator.name || "Creator"}
                    fill
                    sizes="96px"
                    className="object-cover"
                    fallback={
                      <div className="grid h-full w-full place-items-center text-xl font-bold text-slate-400">
                        {creator.name?.[0] || "?"}
                      </div>
                    }
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xl font-bold text-slate-400">
                    {creator.name?.[0] || "?"}
                  </div>
                )}
              </div>
            </div>

            <h3 className="mt-3 text-[19px] font-bold text-white">
              {creator.name || (lang === "zh" ? "未知达人" : "Unknown Creator")}
            </h3>
            <p className="mt-1 text-[13px] text-slate-400">
              {[creator.handle, creator.location].filter(Boolean).join(" · ")}
            </p>

            {creator.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {creator.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: "rgba(168,85,247,0.18)", color: "#d8b4fe" }}
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px" style={{ background: "rgba(255,255,255,0.08)" }}>
          <StatCell label={COPY.followers[lang]} value={formatCompact(creator.followers)} />
          <StatCell
            label={COPY.engagement[lang]}
            value={`${engagement.toFixed(1)}%`}
            valueColor={engagement >= HIGH_ENGAGEMENT_THRESHOLD ? "#4ade80" : undefined}
          />
          <StatCell label={COPY.medianViews[lang]} value={formatCompact(creator.medianViews)} />
          <StatCell label={COPY.videos[lang]} value={String(creator.videosCount)} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              {COPY.rate[lang]}
            </div>
            {isMember && creator.rate ? (
              <div className="text-[20px] font-extrabold" style={{ color: "#4ade80" }}>
                {creator.rate}
              </div>
            ) : (
              <Link
                href={membershipHref}
                className="mt-0.5 flex items-center gap-2"
                title={COPY.membersOnly[lang]}
              >
                <span
                  className="select-none text-[20px] font-extrabold text-white"
                  style={{ filter: "blur(6px)" }}
                  aria-hidden
                >
                  {MASKED_RATE}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold"
                  style={{
                    background: "rgba(251,191,36,0.15)",
                    borderColor: "rgba(251,191,36,0.4)",
                    color: "#fbbf24",
                  }}
                >
                  <Lock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  {COPY.membersOnly[lang]}
                </span>
              </Link>
            )}
          </div>

          <Link
            href={profileHref}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            {COPY.viewProfile[lang]}
          </Link>
        </div>
      </div>
    </div>
  );
}
