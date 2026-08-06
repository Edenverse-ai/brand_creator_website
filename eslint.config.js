// ESLint flat config (ESLint v9+)
//
// eslint-config-next v15 does not expose a flat-config subpath.
// We compose the equivalent directly using the underlying plugins,
// all of which support ESLint v9 flat config natively.
//
// Rule severities deliberately mirror the original .eslintrc.json.
// @next/next/no-img-element and react-hooks/exhaustive-deps stay at
// "warn" (not "error") to avoid massive churn — see plan §1.3.

const nextPlugin = require("@next/eslint-plugin-next");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  // ── @next/next: core-web-vitals rules ────────────────────────────────────
  nextPlugin.flatConfig.coreWebVitals,

  // ── React recommended (flat-config native) ───────────────────────────────
  react.configs.flat.recommended,
  // Disables react/react-in-jsx-scope for the modern JSX transform
  react.configs.flat["jsx-runtime"],

  // ── react-hooks ──────────────────────────────────────────────────────────
  {
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },

  // ── Base config matching eslint-config-next defaults ─────────────────────
  {
    settings: {
      // Suppress "React version not specified" warning
      react: { version: "detect" },
    },
    rules: {
      // eslint-config-next disables these — keep parity
      "react/prop-types": "off",
      "react/no-unknown-property": "off",
      "react/jsx-no-target-blank": "off",
    },
  },

  // ── TypeScript files: parser + @typescript-eslint rules ──────────────────
  // Scoped to TS/TSX only so the TypeScript parser does not run on plain JS.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: { parser: tsParser, parserOptions: { project: true } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Disable base rule in favour of @typescript-eslint variant
      "no-unused-vars": "off",
    },
  },

  // ── All JS/TS files: project-specific rule overrides ─────────────────────
  {
    rules: {
      "react/no-unescaped-entities": "error",
      // Intentionally warn — see plan §1.3
      "@next/next/no-img-element": "warn",
      "react-hooks/rules-of-hooks": "error",
      // Intentionally warn — see plan §1.3
      "react-hooks/exhaustive-deps": "warn",
      // Restore legacy next/core-web-vitals parity:
      // react.configs.flat["jsx-runtime"] turns off react/jsx-uses-react,
      // which causes @typescript-eslint/no-unused-vars to flag bare
      // "import React from 'react'" as an error.  The legacy
      // plugin:react/recommended kept react/jsx-uses-react enabled so
      // that React was marked as used whenever JSX appeared in the file —
      // silencing the unused-vars error.  Re-enable it here to match that
      // behaviour exactly and achieve 0-error parity with next/core-web-vitals.
      "react/jsx-uses-react": "warn",
    },
  },

  // ── Global ignores (replaces .eslintignore) ───────────────────────────────
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "public/**",
      // Decommissioned FastAPI backend + orphaned Python/JS, kept read-only for
      // reference. Never built, linted, or deployed — see legacy/ARCHIVE.md.
      "legacy/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      ".netlify/**",
      // Supabase CLI's own generated/runtime state (mirrors supabase/.gitignore)
      // — includes Deno edge-function scaffolding outside this repo's tsconfig.
      "supabase/.temp/**",
      "supabase/.branches/**",
      // Claude Code session/worktree scratch space — may contain build output
      // (e.g. .next/) from unrelated concurrent sessions sharing this checkout.
      ".claude/**",
      // git worktrees checked out inside the repo carry their own build output;
      // each is linted on its own branch, never through the parent checkout.
      ".worktrees/**",
    ],
  },
];
