"use client";

import { KeyboardEvent, useState } from "react";

/**
 * A task's failure reason, clamped to three lines. Clicking (or Enter/Space)
 * shows the full text as plain text, so the creator can select and copy it;
 * "Show less" clamps it again.
 */
export default function FailureReason({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = "text-xs text-rose-600 [overflow-wrap:anywhere]";

  if (expanded) {
    return (
      <div className={className}>
        <p className={`${text} select-text`}>{message}</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Show less
        </button>
      </div>
    );
  }

  const expandOnKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded(true);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={false}
      onClick={() => setExpanded(true)}
      onKeyDown={expandOnKey}
      className={`${text} line-clamp-3 cursor-pointer hover:text-rose-700 ${className}`}
    >
      {message}
    </div>
  );
}
