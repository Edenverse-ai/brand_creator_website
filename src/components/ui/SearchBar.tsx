"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Platform, PLATFORM_LABELS } from "@/types/platform";
import { Category, CATEGORY_LABELS } from "@/types/category";

interface SearchBarProps {
  initialPlatform?: Platform | "all";
  initialCategory?: Category | "all";
}

const platforms = [
  { id: "all" as const, name: "All Platforms" },
  ...Object.entries(PLATFORM_LABELS).map(([id, name]) => ({ id: id as Platform, name })),
];

const categories = [
  { id: "all" as const, name: "All Categories" },
  ...Object.entries(CATEGORY_LABELS).map(([id, name]) => ({ id: id as Category, name })),
];

export function SearchBar({ initialPlatform = "all", initialCategory = "all" }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const platform = formData.get("platform") as string;
    const category = formData.get("category") as string;

    const params = new URLSearchParams(searchParams?.toString() || "");

    if (platform && platform !== "all") params.set("platform", platform);
    else params.delete("platform");
    if (category && category !== "all") params.set("category", category);
    else params.delete("category");

    router.push(`/find-creators${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
      <select
        name="platform"
        defaultValue={initialPlatform}
        className="flex-1 px-4 py-3 rounded-control bg-surface-raised text-ink border border-line focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
      >
        {platforms.map((platform) => (
          <option key={platform.id} value={platform.id} className="text-ink">
            {platform.name}
          </option>
        ))}
      </select>

      <select
        name="category"
        defaultValue={initialCategory}
        className="flex-1 px-4 py-3 rounded-control bg-surface-raised text-ink border border-line focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id} className="text-ink">
            {category.name}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="px-8 py-3 bg-accent text-accent-contrast font-medium rounded-full hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors duration-fast"
      >
        Search
      </button>
    </form>
  );
}
