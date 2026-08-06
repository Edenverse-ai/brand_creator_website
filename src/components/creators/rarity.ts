export type Rarity = "SSR" | "SR" | "R";

export interface RarityStyle {
  /** 2px gradient frame used by the card border and the avatar ring */
  frame: string;
  glow: string;
  color: string;
  bg: string;
  border: string;
  word: { en: string; zh: string };
}

const SSR_MIN_FOLLOWERS = 1_000_000;
const SR_MIN_FOLLOWERS = 500_000;

export const RARITY_STYLES: Readonly<Record<Rarity, RarityStyle>> = {
  SSR: {
    frame: "linear-gradient(135deg,#fde68a 0%,#f59e0b 30%,#fbbf24 55%,#b45309 100%)",
    glow: "0 10px 30px -8px rgba(245,158,11,0.45)",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.45)",
    word: { en: "Legendary", zh: "传说" },
  },
  SR: {
    frame: "linear-gradient(135deg,#e9d5ff 0%,#a855f7 35%,#6366f1 70%,#7e22ce 100%)",
    glow: "0 10px 30px -8px rgba(168,85,247,0.4)",
    color: "#d8b4fe",
    bg: "rgba(168,85,247,0.14)",
    border: "rgba(168,85,247,0.5)",
    word: { en: "Epic", zh: "史诗" },
  },
  R: {
    frame: "linear-gradient(135deg,#bae6fd 0%,#38bdf8 40%,#6366f1 100%)",
    glow: "0 10px 30px -8px rgba(56,189,248,0.35)",
    color: "#7dd3fc",
    bg: "rgba(56,189,248,0.12)",
    border: "rgba(56,189,248,0.45)",
    word: { en: "Rare", zh: "稀有" },
  },
};

export function rarityOf(followers: number): Rarity {
  if (followers >= SSR_MIN_FOLLOWERS) return "SSR";
  if (followers >= SR_MIN_FOLLOWERS) return "SR";
  return "R";
}

/** 2,400,000 -> "2.4M", 890,000 -> "890K" */
export function formatCompact(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}K`;
  return String(value);
}
