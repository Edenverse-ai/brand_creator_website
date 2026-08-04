import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      // Widened post-review (IMPORTANT 6): this repo's first hand-written
      // Netlify function (netlify/functions/tiktok-publish-background.ts) had
      // zero test coverage because nothing outside src/ and tests/ was ever
      // collected -- its auth gate, URL guard invocation, payload validation,
      // and log redaction were all untested.
      "netlify/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
