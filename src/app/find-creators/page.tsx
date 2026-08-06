"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import CreatorTradingCard from "@/components/creators/CreatorTradingCard";

// Type definitions for creator data
interface Platform {
  platform: {
    name: string;
    displayName: string;
    iconUrl: string;
  };
  followers: number;
  engagementRate: number;
  handle: string;
}

interface Creator {
  id: string;
  bio: string | null;
  location: string;
  categories: string[];
  medianViews: number;
  videosCount: number;
  /** Server-gated: null for non-members. */
  rate: string | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  platforms: Platform[];
}

interface CreatorsResponse {
  creators: Creator[];
  totalCount: number;
  hasMore: boolean;
  isMember?: boolean;
  error?: string;
}

export default function FindCreators() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noCreators, setNoCreators] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasNewCreators, setHasNewCreators] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(false);
  const PAGE_SIZE = 24;

  // Check for creators (both new and existing)
  const checkForCreators = useCallback(async (refreshAll = false) => {
    try {
      const url = refreshAll ? "/api/creators/check-new?refresh=true" : "/api/creators/check-new";

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to check for creators");
      }

      const data = await response.json();
      setHasNewCreators(data.hasNewCreators);

      return {
        hasNewCreators: data.hasNewCreators,
        hasCreators: data.hasCreators,
        allCreators: data.allCreators,
        newCreators: data.newCreators,
      };
    } catch (err) {
      console.error("Error checking for creators:", err);
      return {
        hasNewCreators: false,
        hasCreators: false,
        allCreators: [],
        newCreators: [],
      };
    }
  }, []);

  // Fetch creators data from API
  const fetchCreators = useCallback(async () => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (searchQuery) params.append("query", searchQuery);
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedPlatform) params.append("platform", selectedPlatform);

      // Add pagination parameters
      params.append("page", currentPage.toString());
      params.append("pageSize", PAGE_SIZE.toString());

      // Add a cache-busting parameter to ensure fresh data
      params.append("_t", Date.now().toString());

      const response = await fetch(`/api/creators?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch creators");

      const data: CreatorsResponse = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setCreators(data.creators || []);
      setIsMember(Boolean(data.isMember));
      setTotalPages(Math.ceil(data.totalCount / PAGE_SIZE));
      setHasMorePages(data.hasMore);
      setNoCreators(data.totalCount === 0);
      setError("");
    } catch (err) {
      console.error("Error fetching creators:", err);
      setError("Failed to load creators. Please try again later.");
      setCreators([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedPlatform, currentPage]);

  // Function to sync TikTok creators (new or refresh all)
  const syncCreators = useCallback(
    async (refreshAll = false) => {
      try {
        setIsSyncing(true);

        // Step 1: Get creators to sync (all or just new ones)
        const creatorsData = await checkForCreators(refreshAll);
        const creatorsToSync = refreshAll ? creatorsData.allCreators : creatorsData.newCreators;

        if (!creatorsToSync.length) {
          // No creators to sync
          await fetchCreators();
          return;
        }

        setRefreshProgress({ current: 0, total: creatorsToSync.length });
        setIsRefreshing(true);

        // Step 2: Sync each creator individually to show progress
        for (let i = 0; i < creatorsToSync.length; i++) {
          const handle = creatorsToSync[i];

          // Update progress
          setRefreshProgress({ current: i + 1, total: creatorsToSync.length });

          // Sync this creator
          try {
            await fetch(`/api/creators/sync?handle_name=${encodeURIComponent(handle)}`);
          } catch (err) {
            console.error(`Failed to sync creator ${handle}:`, err);
          }
        }

        setHasNewCreators(false);

        // After syncing, fetch creators again
        await fetchCreators();
      } catch (err) {
        console.error("Error syncing creators:", err);
        setError("Failed to sync creators. Please try again later.");
      } finally {
        setIsSyncing(false);
        setIsRefreshing(false);
      }
    },
    [checkForCreators, fetchCreators]
  );

  // Function to refresh all creators
  const handleRefreshAllCreators = () => {
    syncCreators(true);
  };

  // Function to sync only new creators
  const handleSyncNewCreators = () => {
    syncCreators(false);
  };

  // Initial load logic - check for new creators and fetch
  useEffect(() => {
    const initPage = async () => {
      const creatorsData = await checkForCreators();
      if (creatorsData.hasNewCreators) {
        // Auto-sync new creators on page load
        await syncCreators(false);
      } else {
        await fetchCreators();
      }
    };

    initPage();
  }, [checkForCreators, syncCreators, fetchCreators]);

  // Re-fetch when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchCreators();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedCategory, selectedPlatform, fetchCreators]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedPlatform]);

  // Function to handle filter clearing
  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedPlatform("");
  };

  // Function to refresh the page and check for new creators
  const _handleRefreshCreators = async () => {
    const creatorsData = await checkForCreators(true);
    if (creatorsData.hasNewCreators) {
      await syncCreators(false); // Only sync new creators by default
    } else if (creatorsData.hasCreators) {
      // Ask if user wants to refresh all creators
      if (
        confirm("No new creators found. Do you want to refresh data for all existing creators?")
      ) {
        await syncCreators(true);
      } else {
        await fetchCreators();
      }
    } else {
      await fetchCreators();
    }
  };

  // Handlers for pagination
  const handleNextPage = () => {
    if (hasMorePages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="border-b border-line bg-surface-sunken">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="font-display text-h1 font-semibold text-ink">Find Creators</h1>
            <p className="mt-2 text-lg text-ink-muted">
              Discover and connect with top content creators for your next campaign
            </p>
          </div>
          <div className="flex space-x-2">
            {hasNewCreators && (
              <button
                onClick={handleSyncNewCreators}
                disabled={isSyncing}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-success hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
              >
                <svg
                  className="-ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
                Sync New Creators
              </button>
            )}

            <button
              onClick={handleRefreshAllCreators}
              disabled={isSyncing}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-accent-contrast bg-accent hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {isRefreshing
                    ? `Refreshing ${refreshProgress.current}/${refreshProgress.total}`
                    : "Refreshing..."}
                </>
              ) : (
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 8 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh All Creators
                </>
              )}
            </button>

            <Link
              href="/membership"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast shadow-sm hover:bg-accent-strong"
            >
              <Lock className="h-4 w-4" aria-hidden />
              Unlock rates with membership
            </Link>
          </div>
        </div>
      </div>

      {/* Members-only notice */}
      <div className="border-b border-line bg-accent-soft">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 text-sm text-accent-strong sm:px-6 lg:px-8">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Creator cards are free to browse — rates and contact are members-only, from $99/month.
          </span>
          <Link href="/membership" className="font-semibold underline underline-offset-2">
            View plans
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Search creators by name, bio, or handle"
              className="w-full px-4 py-2 border border-line rounded-control bg-surface-raised text-ink shadow-sm focus:ring-ring focus:border-accent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <select
              className="w-full px-4 py-2 border border-line rounded-control bg-surface-raised text-ink shadow-sm focus:ring-ring focus:border-accent"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="Comedy">Comedy</option>
              <option value="Beauty">Beauty</option>
              <option value="Fashion">Fashion</option>
              <option value="Fitness">Fitness</option>
              <option value="News & Entertainment">News & Entertainment</option>
              <option value="Sports">Sports</option>
            </select>
          </div>
          <div>
            <select
              className="w-full px-4 py-2 border border-line rounded-control bg-surface-raised text-ink shadow-sm focus:ring-ring focus:border-accent"
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
            >
              <option value="">All Platforms</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
          <p className="mt-2 text-ink-muted">Loading creators...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <p className="text-danger">{error}</p>
          <button
            onClick={handleClearFilters}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-accent-contrast bg-accent hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
          >
            Clear Filters & Try Again
          </button>
        </div>
      )}

      {/* Creator List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {!loading && !error && creators.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ink-muted text-lg">No creators found matching your criteria</p>
            {noCreators && (
              <button
                onClick={() => syncCreators(false)}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-accent-contrast bg-accent hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
              >
                Sync TikTok Creators
              </button>
            )}
            {!noCreators && (
              <button
                onClick={handleClearFilters}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-accent-contrast bg-accent hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          // Only render grid if not loading, no error, and we have creators
          !loading &&
          !error && (
            <>
              <div className="mt-6 grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
                {creators.map((creator) => (
                  <CreatorTradingCard
                    key={creator.id}
                    lang="en"
                    isMember={isMember}
                    creator={{
                      id: creator.id,
                      name: creator.user.name,
                      handle: creator.platforms[0]?.handle
                        ? `@${creator.platforms[0].handle.replace(/^@/, "")}`
                        : null,
                      location: creator.location,
                      avatar: creator.user.image,
                      categories: creator.categories ?? [],
                      followers: Number(creator.platforms[0]?.followers) || 0,
                      engagementRate: Number(creator.platforms[0]?.engagementRate) || 0,
                      medianViews: creator.medianViews,
                      videosCount: creator.videosCount,
                      rate: creator.rate,
                    }}
                  />
                ))}
              </div>

              {/* Pagination UI */}
              {totalPages > 1 && (
                <div className="mt-10 flex justify-center">
                  <nav
                    className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                    aria-label="Pagination"
                  >
                    {/* Previous page button */}
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                      className={`relative inline-flex items-center px-2 py-2 rounded-l-full border border-line bg-surface-raised text-sm font-medium ${
                        currentPage === 1
                          ? "text-line cursor-not-allowed"
                          : "text-ink-muted hover:bg-surface-sunken"
                      }`}
                    >
                      <span className="sr-only">Previous</span>
                      <svg
                        className="h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {/* Page number buttons */}
                    {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                      // Show current page and nearby pages
                      let pageToShow = currentPage - 2 + i;

                      // Adjustments for edges
                      if (currentPage < 3) {
                        pageToShow = i + 1;
                      } else if (currentPage > totalPages - 2) {
                        pageToShow = totalPages - 4 + i;
                      }

                      // Ensure page is in valid range
                      if (pageToShow < 1 || pageToShow > totalPages) {
                        return null;
                      }

                      return (
                        <button
                          key={pageToShow}
                          onClick={() => handlePageChange(pageToShow)}
                          className={`relative inline-flex items-center px-4 py-2 border border-line text-sm font-medium ${
                            currentPage === pageToShow
                              ? "z-10 bg-accent-soft border-accent text-accent"
                              : "bg-surface-raised text-ink-muted hover:bg-surface-sunken"
                          }`}
                        >
                          {pageToShow}
                        </button>
                      );
                    })}

                    {/* Next page button */}
                    <button
                      onClick={handleNextPage}
                      disabled={!hasMorePages}
                      className={`relative inline-flex items-center px-2 py-2 rounded-r-full border border-line bg-surface-raised text-sm font-medium ${
                        !hasMorePages
                          ? "text-line cursor-not-allowed"
                          : "text-ink-muted hover:bg-surface-sunken"
                      }`}
                    >
                      <span className="sr-only">Next</span>
                      <svg
                        className="h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4-4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </nav>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
