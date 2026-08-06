import { Creator } from "@/types/creator";
import Image from "next/image";
import { Card } from "./Card";

interface CreatorCardProps {
  creator: Creator;
}

export function CreatorCard({ creator }: CreatorCardProps) {
  return (
    <Card className="group overflow-hidden border border-line transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow">
      <div className="relative h-48 overflow-hidden">
        {creator.user.image ? (
          <Image
            src={creator.user.image}
            alt={creator.user.name || "Creator"}
            fill
            className="object-cover transition-transform duration-normal ease-out-expo group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-sunken">
            <span className="text-ink-muted">No Image</span>
          </div>
        )}
      </div>
      <div className="p-5">
        {creator.location ? (
          <p className="mb-1 text-micro font-medium uppercase tracking-micro text-accent">
            {creator.location}
          </p>
        ) : null}
        <h3 className="mb-2 font-display text-h3 font-semibold text-ink">
          {creator.user.name || "Anonymous Creator"}
        </h3>
        <p className="mb-4 line-clamp-2 text-sm leading-[--leading-body] text-ink-muted">
          {creator.bio}
        </p>
        <div className="flex justify-between border-t border-line pt-4 text-sm text-ink-muted">
          <div>
            <span className="font-display text-lg font-semibold text-ink">
              {(creator.followers / 1000000).toFixed(1)}M
            </span>
            <span className="ml-1.5">followers</span>
          </div>
          <div>
            <span className="font-display text-lg font-semibold text-ink">
              {creator.engagementRate.toFixed(1)}%
            </span>
            <span className="ml-1.5">engagement</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
