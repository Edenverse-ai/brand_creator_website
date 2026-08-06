import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          sunken: "var(--surface-sunken)",
        },
        ink: { DEFAULT: "var(--ink)", muted: "var(--ink-muted)" },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          contrast: "var(--accent-contrast)",
        },
        line: "var(--line)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        // temporary aliases for unmigrated pages; removed in Task 11
        background: "var(--surface)",
        foreground: "var(--ink)",
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        glow: "var(--glow-accent)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
      },
      fontSize: {
        hero: [
          "var(--text-hero)",
          { lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)" },
        ],
        h1: [
          "var(--text-h1)",
          { lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)" },
        ],
        h2: ["var(--text-h2)", { lineHeight: "1.15" }],
        h3: ["var(--text-h3)", { lineHeight: "1.25" }],
        micro: ["var(--text-micro)", { letterSpacing: "var(--tracking-micro)" }],
      },
      transitionDuration: { fast: "150ms", normal: "300ms", slow: "600ms" },
      transitionTimingFunction: { "out-expo": "var(--ease-out-expo)" },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-hero": "var(--gradient-hero)",
      },
    },
  },
  plugins: [],
} satisfies Config;
