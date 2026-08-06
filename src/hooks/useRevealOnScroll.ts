"use client";

import { useEffect } from "react";

const REVEAL_THRESHOLD = 0.15;

/**
 * Adds `.is-visible` to every `.reveal-up` element as it enters the
 * viewport (once). Call from a client component near the page root.
 */
export function useRevealOnScroll() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal-up"));
    if (elements.length === 0) return;

    if (typeof IntersectionObserver === "undefined") {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: REVEAL_THRESHOLD }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}
