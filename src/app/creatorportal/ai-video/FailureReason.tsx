"use client";

import { useState } from "react";

/**
 * A task's failure reason, clamped to a few lines. Hovering shows the full text
 * as a tooltip; clicking (or Enter/Space) expands it in place and collapses it again.
 */
export default function FailureReason({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      title={expanded ? undefined : message}
      aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
      className={`block w-full cursor-pointer text-left text-xs text-rose-600 [overflow-wrap:anywhere] hover:text-rose-700 ${className}`}
    >
      {/* The clamp lives on the span: line-clamp needs its own display box. */}
      <span className={expanded ? "block" : "line-clamp-3"}>{message}</span>
    </button>
  );
}
