import React from "react";
import Link from "next/link";
import Image from "next/image";

interface Creator {
  id: string;
  name: string;
  image?: string | null;
  followers: number;
  engagementRate: number;
  platforms?: Array<{
    platform: {
      name: string;
      displayName: string;
      iconUrl?: string;
    };
    followers: number;
    engagementRate: number;
  }>;
}

interface PlatformSectionProps {
  platform: string;
  creators: Creator[];
  iconUrl?: string | null;
}

export default function PlatformSection({ platform, creators, iconUrl }: PlatformSectionProps) {
  if (!creators || creators.length === 0) {
    return null;
  }

  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          {iconUrl && (
            <div className="mr-2 w-6 h-6 relative">
              <Image src={iconUrl} alt={platform} width={24} height={24} />
            </div>
          )}
          <h2 className="text-2xl font-bold">{platform} Creators</h2>
        </div>

        <Link
          href={`/platforms/${platform.toLowerCase()}`}
          className="text-accent hover:text-accent-strong"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {creators.slice(0, 6).map((creator) => {
          // Check if platforms exists before using find
          const platformData = creator.platforms
            ? creator.platforms.find((p) => p.platform.name === platform.toLowerCase())
            : undefined;

          // If no platform data, use the creator's direct properties
          const followers = platformData ? platformData.followers : creator.followers;
          const engagementRate = platformData
            ? platformData.engagementRate
            : creator.engagementRate;

          return (
            <Link
              href={`/creator/${creator.id}`}
              key={creator.id}
              className="block hover:shadow-lg transition-shadow duration-300"
            >
              <div className="bg-surface-raised rounded-card shadow-raised border border-line overflow-hidden h-full transition-all duration-fast ease-out-expo hover:-translate-y-0.5 hover:shadow-glow">
                <div className="p-6">
                  <div className="flex items-center">
                    <div className="mr-4">
                      {creator.image ? (
                        <div className="w-16 h-16 relative">
                          <Image
                            src={creator.image}
                            alt={creator.name}
                            className="rounded-full object-cover"
                            width={64}
                            height={64}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "/images/default-avatar.png";
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-surface-sunken flex items-center justify-center">
                          <span className="text-ink-muted text-lg font-bold">
                            {creator.name ? creator.name[0].toUpperCase() : "?"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-display text-h3 font-semibold text-ink">
                        {creator.name}
                      </h3>
                      <div className="flex items-center text-sm text-ink-muted">
                        <span>{followers.toLocaleString()} followers</span>
                        <span className="mx-2">•</span>
                        <span>{engagementRate.toFixed(2)}% engagement</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
