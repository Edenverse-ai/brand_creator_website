"use client";

import Link from "next/link";
import ErrorHandlingImage from "./ErrorHandlingImage";

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  link: string | null;
}

interface PortfolioGalleryProps {
  items: PortfolioItem[];
}

export function PortfolioGallery({ items }: PortfolioGalleryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-surface-raised shadow-raised border border-line rounded-card overflow-hidden transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow"
        >
          {item.imageUrl && (
            <div className="relative h-48">
              <ErrorHandlingImage
                src={item.imageUrl}
                alt={item.title}
                fill
                className="object-cover"
                fallback={
                  <div className="h-48 bg-surface-sunken flex items-center justify-center">
                    <span className="text-ink-muted">Image unavailable</span>
                  </div>
                }
              />
            </div>
          )}
          <div className="p-6">
            <h3 className="font-display text-h3 font-semibold text-ink">{item.title}</h3>
            {item.description && <p className="mt-2 text-ink-muted">{item.description}</p>}
            {item.link && (
              <Link
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center text-sm font-medium text-accent hover:text-accent-strong"
              >
                View Project
                <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
