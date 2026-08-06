import { Instagram, Youtube, Globe, Video } from "lucide-react";
import Link from "next/link";

interface SocialLinksProps {
  [key: string]: string | undefined;
}

const platformConfig: { [key: string]: { icon: React.ElementType; baseUrl: string } } = {
  instagram: {
    icon: Instagram,
    baseUrl: "https://instagram.com",
  },
  tiktok: {
    icon: Video,
    baseUrl: "https://tiktok.com/@",
  },
  youtube: {
    icon: Youtube,
    baseUrl: "https://youtube.com/@",
  },
  weibo: {
    icon: Globe,
    baseUrl: "https://weibo.com/",
  },
  xiaohongshu: {
    icon: Globe,
    baseUrl: "https://xiaohongshu.com/user/profile/",
  },
  douyin: {
    icon: Video,
    baseUrl: "https://douyin.com/user/",
  },
};

export function SocialLinks(props: SocialLinksProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {Object.entries(props).map(([platform, handle]) => {
        if (!handle || !platformConfig[platform]) return null;

        const { icon: Icon, baseUrl } = platformConfig[platform];
        const url = handle.startsWith("http") ? handle : `${baseUrl}${handle.replace("@", "")}`;

        return (
          <Link
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-ink-muted hover:text-ink transition-colors duration-fast"
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm">{handle}</span>
          </Link>
        );
      })}
    </div>
  );
}
