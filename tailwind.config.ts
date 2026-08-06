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
        // rgb(var(--x-rgb) / <alpha-value>) enables opacity modifiers (bg-surface/80)
        surface: {
          DEFAULT: "rgb(var(--surface-rgb) / <alpha-value>)",
          raised: "var(--surface-raised)",
          sunken: "rgb(var(--surface-sunken-rgb) / <alpha-value>)",
        },
        ink: { DEFAULT: "rgb(var(--ink-rgb) / <alpha-value>)", muted: "var(--ink-muted)" },
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          strong: "var(--accent-strong)",
          soft: "rgb(var(--accent-soft-rgb) / <alpha-value>)",
          contrast: "var(--accent-contrast)",
          // shadcn components' text pair for bg-accent
          foreground: "var(--accent-contrast)",
        },
        line: "var(--line)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        info: "var(--info)",
        // temporary aliases for unmigrated pages; removed in Task 11
        background: "var(--surface)",
        foreground: "var(--ink)",
        // shadcn/ui component vocabulary (aliases of semantic tokens via themes.css)
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "rgb(var(--surface-sunken-rgb) / <alpha-value>)",
          foreground: "var(--secondary-foreground)",
        },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        destructive: {
          DEFAULT: "rgb(var(--danger-rgb) / <alpha-value>)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
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
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
