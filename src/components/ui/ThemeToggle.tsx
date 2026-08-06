"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Avoid hydration mismatch: theme unknown until mounted on client
  if (!mounted) return <span className="inline-block h-9 w-9" aria-hidden />;
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-line text-ink transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {resolvedTheme === "dark" ? "☾" : "☀"}
    </button>
  );
}
