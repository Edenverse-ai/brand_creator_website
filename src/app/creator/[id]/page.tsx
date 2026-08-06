import { notFound } from "next/navigation";
import Link from "next/link";
import { isMember } from "@/lib/membership";
import { SocialLinks } from "@/components/ui/SocialLinks";
import { Stats } from "@/components/ui/Stats";
import ErrorHandlingImage from "@/components/ui/ErrorHandlingImage";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import ClientAudienceChartWrapper from "@/components/charts/ClientAudienceChartWrapper";
import ClientPerformanceChartWrapper from "@/components/charts/ClientPerformanceChartWrapper";

// Function to get creator profile from database
async function getCreatorProfile(id: string) {
  try {
    const creator = await prisma.findCreator.findUnique({
      where: { id },
    });

    if (!creator) return null;

    // Format the creator data to match the structure expected by the component
    return {
      id: creator.id,
      bio: creator.bio || "",
      location: "TikTok Creator", // Placeholder since we don't have location from TikTok API
      categories: creator.content_label_name ? JSON.stringify([creator.content_label_name]) : "[]",
      user: {
        id: creator.id,
        name: creator.display_name || "",
        image: creator.profile_image || "",
      },
      platforms: [
        {
          id: "1",
          platform: {
            id: "1",
            name: "tiktok",
            displayName: "TikTok",
            iconUrl: "/icons/tiktok.svg",
          },
          followers: Number(creator.follower_count) || 0,
          engagementRate: Number(creator.engagement_rate) || 0,
          handle: `@${creator.creator_handle_name}`,
        },
      ],
      portfolioItems: [],
      posts: [],
      creator_handle_name: creator.creator_handle_name,
      creator_id: creator.creator_id,
      industry_label_name: creator.industry_label_name,
      follower_count: Number(creator.follower_count) || 0,
      following_count: Number(creator.following_count) || 0,
      like_count: Number(creator.like_count) || 0,
      videos_count: Number(creator.videos_count) || 0,
      engagement_rate: Number(creator.engagement_rate) || 0,
      median_views: Number(creator.median_views) || 0,
      content_label_name: creator.content_label_name,
      creator_price: Number(creator.creator_price) || 0,
      currency: creator.currency,
    };
  } catch (error) {
    console.error("Error fetching creator profile:", error);
    return null;
  }
}

// Parse categories helper function
function parseCategories(categoriesStr: string | null): string[] {
  if (!categoriesStr) return [];

  try {
    // Try parsing as JSON first
    const parsed = JSON.parse(categoriesStr);

    // Handle both array and string cases
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (typeof parsed === "string") {
      return [parsed]; // Convert single string to array with one element
    } else {
      return [];
    }
  } catch (_e) {
    // If JSON parsing fails, split by comma and trim
    return categoriesStr
      .split(",")
      .map((cat) => cat.trim())
      .filter(Boolean);
  }
}

// Generate metadata for the page
export async function generateMetadata(props: any): Promise<Metadata> {
  const params = await props.params;
  const { id } = params;
  const creator = await getCreatorProfile(id);

  if (!creator) {
    return {
      title: "Creator Not Found",
    };
  }

  return {
    title: `${creator.user.name} - Creator Profile`,
    description: creator.bio || `View ${creator.user.name}'s creator profile`,
  };
}

export default async function CreatorProfile(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;
    const creator = await getCreatorProfile(id);

    if (!creator) {
      notFound();
    }

    const categories = parseCategories(creator.categories);
    const viewerIsMember = await isMember();

    // Calculate metrics from real data only
    const totalFollowers = creator.platforms.reduce((sum: number, cp) => {
      const followers = typeof cp.followers === "number" ? cp.followers : Number(cp.followers) || 0;
      return sum + followers;
    }, 0);
    const averageEngagementRate =
      typeof creator.platforms[0]?.engagementRate === "number"
        ? creator.platforms[0]?.engagementRate
        : Number(creator.platforms[0]?.engagementRate) || 0;

    // Create social links from real data
    const socialLinks = creator.platforms.reduce((acc, cp) => {
      if (cp.platform && cp.platform.name && cp.handle) {
        return {
          ...acc,
          [cp.platform.name]: cp.handle,
        };
      }
      return acc;
    }, {});

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-purple-900 text-white">
          <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-extrabold">Creator Profile</h1>
            <p className="mt-2 text-lg">View detailed metrics and performance data</p>
            <div className="mt-4 flex flex-wrap gap-4">
              <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
                Book Collaboration
              </button>
              <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                Compare Creators
              </button>
              <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Send Notification
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <input
              type="text"
              placeholder="Search creators..."
              className="w-full md:w-1/3 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <select className="w-full md:w-1/4 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
              <option value="">Filter by Category</option>
              <option value="beauty">Beauty</option>
              <option value="fashion">Fashion</option>
              <option value="travel">Travel</option>
              <option value="food">Food</option>
              <option value="fitness">Fitness</option>
            </select>
            <select className="w-full md:w-1/4 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
              <option value="">Filter by Platform</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="twitter">Twitter</option>
            </select>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Profile Header and Image */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="relative h-48 bg-gradient-to-r from-purple-600 to-indigo-600">
              {creator.user.image && (
                <div className="absolute -bottom-12 left-8">
                  <div className="relative w-32 h-32">
                    <ErrorHandlingImage
                      src={creator.user.image}
                      alt={creator.user.name || ""}
                      fill
                      sizes="128px"
                      className="rounded-full border-4 border-white object-cover"
                      priority
                      fallback={
                        <div className="w-32 h-32 rounded-full border-4 border-white bg-gray-200 flex items-center justify-center text-gray-400">
                          No Image
                        </div>
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-16 pb-8 px-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{creator.user.name}</h1>
                  <p className="text-gray-500">{creator.location || "TikTok Creator"}</p>
                </div>
                <Stats followers={totalFollowers} engagementRate={averageEngagementRate} />
              </div>

              <div className="mt-6">
                <p className="text-gray-700">{creator.bio || "No bio available"}</p>
              </div>

              {/* Creator Metrics Card - Only show real data */}
              <div className="mt-8 bg-gray-50 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Creator Metrics</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Stats */}
                  <div className="bg-white p-4 rounded-md shadow-sm">
                    <h3 className="text-sm font-medium text-gray-500">Followers</h3>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {totalFollowers.toLocaleString()}
                    </p>
                  </div>

                  {/* Engagement Rate */}
                  <div className="bg-white p-4 rounded-md shadow-sm">
                    <h3 className="text-sm font-medium text-gray-500">Engagement Rate</h3>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {averageEngagementRate.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              {categories.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map((category: string) => (
                      <span
                        key={category}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Platform Stats */}
              {creator.platforms.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-lg font-semibold text-gray-900">Platforms</h2>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {creator.platforms.map((cp) => (
                      <div
                        key={cp.platform.id}
                        className="bg-gray-50 rounded-lg p-4 flex items-center space-x-4"
                      >
                        <div className="flex-shrink-0">
                          {cp.platform.iconUrl ? (
                            <ErrorHandlingImage
                              src={cp.platform.iconUrl}
                              alt={cp.platform.displayName}
                              width={24}
                              height={24}
                              fallback={<div className="w-6 h-6 bg-gray-200 rounded"></div>}
                            />
                          ) : (
                            <div className="w-6 h-6 bg-gray-200 rounded" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{cp.platform.displayName}</h3>
                          <div className="text-sm text-gray-500">
                            <p>
                              {new Intl.NumberFormat().format(Number(cp.followers) || 0)} followers
                            </p>
                            <p>
                              {(typeof cp.engagementRate === "number"
                                ? cp.engagementRate
                                : Number(cp.engagementRate) || 0
                              ).toFixed(1)}
                              % engagement
                            </p>
                            {cp.handle && <p className="text-gray-400">{cp.handle}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Creator Detailed Stats */}
              <div className="mt-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Creator Details</h2>

                {/* Account Information */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-6 mb-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-purple-800 mb-3 border-b border-purple-200 pb-2">
                    Account Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Creator Handle</p>
                      <p className="text-lg font-bold text-gray-900">
                        @{creator?.creator_handle_name || "N/A"}
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Creator ID</p>
                      <p className="text-lg font-bold text-gray-900">
                        {creator?.creator_id || "N/A"}
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Industry</p>
                      <p className="text-lg font-bold text-gray-900">
                        {creator?.industry_label_name || "Not specified"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Audience Metrics */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 mb-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-blue-800 mb-3 border-b border-blue-200 pb-2">
                    Audience Metrics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Followers</p>
                      <p className="text-xl font-bold text-gray-900">
                        {new Intl.NumberFormat().format(Number(creator?.follower_count) || 0)}
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Following</p>
                      <p className="text-xl font-bold text-gray-900">
                        {new Intl.NumberFormat().format(Number(creator?.following_count) || 0)}
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Total Likes</p>
                      <p className="text-xl font-bold text-gray-900">
                        {new Intl.NumberFormat().format(Number(creator?.like_count) || 0)}
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Videos Count</p>
                      <p className="text-xl font-bold text-gray-900">
                        {new Intl.NumberFormat().format(Number(creator?.videos_count) || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Audience Chart */}
                  <ClientAudienceChartWrapper
                    followerCount={Number(creator?.follower_count) || 0}
                    followingCount={Number(creator?.following_count) || 0}
                    likeCount={Number(creator?.like_count) || 0}
                    videosCount={Number(creator?.videos_count) || 0}
                  />

                  <div className="mt-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">Audience Insight:</span> With{" "}
                      {new Intl.NumberFormat().format(Number(creator?.follower_count) || 0)}{" "}
                      followers and{" "}
                      {new Intl.NumberFormat().format(Number(creator?.like_count) || 0)} likes, this
                      creator has built a substantial audience base in their niche.
                    </p>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-lg p-6 mb-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-green-800 mb-3 border-b border-green-200 pb-2">
                    Performance Metrics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Engagement Rate</p>
                      <p className="text-xl font-bold text-gray-900">
                        {(Number(creator?.engagement_rate) || 0).toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Median Views</p>
                      <p className="text-xl font-bold text-gray-900">
                        {new Intl.NumberFormat().format(Number(creator?.median_views) || 0)}
                      </p>
                    </div>
                    <div className="bg-white rounded-md p-3 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-500">Content Category</p>
                      <p className="text-xl font-bold text-gray-900">
                        {creator?.content_label_name || "Not specified"}
                      </p>
                    </div>
                  </div>

                  {/* Performance Chart */}
                  <ClientPerformanceChartWrapper
                    engagementRate={Number(creator?.engagement_rate) || 0}
                    medianViews={Number(creator?.median_views) || 0}
                    contentCategory={creator?.content_label_name || ""}
                  />

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-green-50 rounded-md">
                      <p className="text-sm text-green-800">
                        <span className="font-semibold">Engagement Analysis:</span> This
                        creator&apos;s {(Number(creator?.engagement_rate) || 0).toFixed(2)}%
                        engagement rate is{" "}
                        {creator?.engagement_rate && Number(creator.engagement_rate) > 2.7
                          ? "above"
                          : "below"}{" "}
                        the platform average of 2.7%.
                      </p>
                    </div>
                    <div className="p-3 bg-teal-50 rounded-md">
                      <p className="text-sm text-teal-800">
                        <span className="font-semibold">View Performance:</span> With{" "}
                        {new Intl.NumberFormat().format(Number(creator?.median_views) || 0)} median
                        views, this creator consistently reaches a significant audience with each
                        post.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Business Information */}
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-amber-800 mb-3 border-b border-amber-200 pb-2">
                    Collaboration Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-md p-4 shadow-sm hover:shadow-md transition-shadow flex items-center">
                      <div className="bg-amber-100 rounded-full p-3 mr-4">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-6 w-6 text-amber-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Creator Rate</p>
                        {viewerIsMember ? (
                          <p className="text-2xl font-bold text-gray-900">
                            {creator?.creator_price
                              ? `${creator.currency || "$"}${new Intl.NumberFormat().format(Number(creator.creator_price) || 0)}`
                              : "Contact for pricing"}
                          </p>
                        ) : (
                          <Link
                            href="/membership"
                            className="mt-1 flex flex-wrap items-center gap-2"
                          >
                            <span
                              className="select-none text-2xl font-bold text-gray-900"
                              style={{ filter: "blur(7px)" }}
                              aria-hidden
                            >
                              $0,000
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                                aria-hidden
                              >
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              Members only — view plans
                            </span>
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium text-gray-500">Availability</p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Available
                        </span>
                      </div>
                      {viewerIsMember ? (
                        <button className="mt-3 w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          Schedule Collaboration
                        </button>
                      ) : (
                        <Link
                          href="/membership"
                          className="mt-3 w-full inline-flex justify-center items-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                        >
                          Contact unlocks with membership
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <SocialLinks {...socialLinks} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error rendering creator profile:", error);
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Error</h1>
          <p className="text-gray-700">An error occurred while rendering the creator profile.</p>
        </div>
      </div>
    );
  }
}
