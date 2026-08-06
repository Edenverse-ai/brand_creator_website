import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMember } from "@/lib/membership";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query") || "";
    const category = searchParams.get("category") || "";
    const platform = searchParams.get("platform") || "";

    // Pagination parameters
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "24", 10);
    const skip = (page - 1) * pageSize;

    // Build filter based on query params
    const filters: any = {};

    // Search for creators by name, bio, or handle name
    if (query) {
      filters.OR = [
        { display_name: { contains: query, mode: "insensitive" } },
        { bio: { contains: query, mode: "insensitive" } },
        { creator_handle_name: { contains: query, mode: "insensitive" } },
      ];
    }

    // Filter by category if specified
    if (category) {
      filters.industry_label_name = { contains: category, mode: "insensitive" };
    }

    // Filter by platform (here we only have TikTok, but keeping for future extensibility)
    if (platform && platform !== "tiktok") {
      return NextResponse.json({
        creators: [],
        totalCount: 0,
        hasMore: false,
      });
    }

    // Count total records for pagination
    const totalCount = await prisma.findCreator.count({ where: filters });

    // Fetch creators with pagination
    const creatorRecords = await prisma.findCreator.findMany({
      where: filters,
      skip,
      take: pageSize,
      orderBy: { follower_count: "desc" },
    });

    // Creator rates are members-only: non-members never receive the value.
    const viewerIsMember = await isMember();

    // Format creators for the frontend
    const creators = creatorRecords.map((creator) => {
      const categories = creator.industry_label_name ? [creator.industry_label_name] : [];

      if (creator.content_label_name && !categories.includes(creator.content_label_name)) {
        categories.push(creator.content_label_name);
      }

      const price = Number(creator.creator_price) || 0;
      const rate =
        viewerIsMember && price > 0
          ? `${creator.currency || "$"}${new Intl.NumberFormat().format(price)}`
          : null;

      return {
        id: creator.id,
        bio: creator.bio,
        location: "TikTok Creator", // Can be enhanced with actual location data
        categories,
        medianViews: Number(creator.median_views) || 0,
        videosCount: Number(creator.videos_count) || 0,
        rate,
        user: {
          id: creator.id,
          name: creator.display_name,
          image: creator.profile_image,
        },
        platforms: [
          {
            platform: {
              name: "tiktok",
              displayName: "TikTok",
              iconUrl: "/icons/tiktok.svg",
            },
            followers: creator.follower_count || 0,
            engagementRate: creator.engagement_rate || 0,
            handle: creator.creator_handle_name,
          },
        ],
      };
    });

    return NextResponse.json({
      creators,
      totalCount,
      hasMore: skip + creators.length < totalCount,
      isMember: viewerIsMember,
    });
  } catch (error) {
    console.error("Error fetching creators:", error);
    return NextResponse.json({ error: "Failed to fetch creators" }, { status: 500 });
  }
}
