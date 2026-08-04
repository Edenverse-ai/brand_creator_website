"use client";

import { Search, Filter, Instagram, Youtube, Video } from "lucide-react";

const partneredCreators = [
  {
    name: "Sarah Johnson",
    handle: "@sarahjstyle",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
    category: "Fashion & Lifestyle",
    followers: "125K",
    engagement: "4.8%",
    platforms: ["instagram", "tiktok"],
    activeCampaigns: 2,
    totalRevenue: "$12,500",
    lastCampaign: "2024-01-15",
    performance: {
      reachTarget: "120%",
      contentQuality: "95%",
      responseTime: "98%",
    },
    recentPosts: [
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=200",
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=200",
    ],
  },
  {
    name: "Michael Chen",
    handle: "@techreviewmike",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    category: "Tech & Gaming",
    followers: "89K",
    engagement: "5.2%",
    platforms: ["youtube", "instagram"],
    activeCampaigns: 1,
    totalRevenue: "$8,900",
    lastCampaign: "2024-01-20",
    performance: {
      reachTarget: "110%",
      contentQuality: "92%",
      responseTime: "95%",
    },
    recentPosts: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=200",
      "https://images.unsplash.com/photo-1591370874773-6702e8f12fd8?w=200",
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200",
    ],
  },
  {
    name: "Emma Rodriguez",
    handle: "@emmafitness",
    avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100",
    category: "Fitness & Health",
    followers: "250K",
    engagement: "6.1%",
    platforms: ["instagram", "tiktok", "youtube"],
    activeCampaigns: 3,
    totalRevenue: "$18,200",
    lastCampaign: "2024-01-25",
    performance: {
      reachTarget: "135%",
      contentQuality: "98%",
      responseTime: "96%",
    },
    recentPosts: [
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=200",
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200",
      "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=200",
    ],
  },
];

const categories = [
  "All Categories",
  "Fashion & Lifestyle",
  "Tech & Gaming",
  "Fitness & Health",
  "Travel & Adventure",
  "Beauty & Skincare",
  "Food & Cooking",
  "Art & Design",
];

const platformIcons = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Video,
};

export default function PartneredCreators() {
  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-gray-600">
        Manage your active partnerships and track creator performance metrics.
      </p>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-xl border border-white/20 bg-white/50 backdrop-blur-xl py-2 pl-10 pr-3 text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search partnered creators..."
          />
        </div>
        <select className="rounded-xl border border-white/20 bg-white/50 backdrop-blur-xl py-2 pl-3 pr-10 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48">
          {categories.map((category) => (
            <option key={category} className="text-gray-700">
              {category}
            </option>
          ))}
        </select>
        <button className="flex items-center rounded-xl border border-white/20 bg-white/50 backdrop-blur-xl px-4 py-2 text-sm text-gray-700 hover:bg-white/80 transition-all duration-300">
          <Filter className="h-5 w-5 mr-2 text-gray-400" />
          More Filters
        </button>
      </div>

      {/* Creators Grid */}
      <div className="grid grid-cols-1 gap-6">
        {partneredCreators.map((creator) => (
          <div
            key={creator.handle}
            className="overflow-hidden rounded-2xl backdrop-blur-xl bg-white/50 border border-white/20 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
          >
            <div className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                {/* Creator Info */}
                <div className="flex items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={creator.avatar}
                    alt={creator.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">{creator.name}</h3>
                    <p className="text-sm text-gray-500">{creator.handle}</p>
                    <div className="mt-1 flex items-center space-x-2">
                      {creator.platforms.map((platform) => {
                        const Icon = platformIcons[platform as keyof typeof platformIcons];
                        return (
                          <div
                            key={platform}
                            className="p-1 rounded-full bg-gray-100 text-gray-600"
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="mt-4 lg:mt-0 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-500">Active Campaigns</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {creator.activeCampaigns}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {creator.totalRevenue}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-500">Last Campaign</p>
                    <p className="mt-1 text-sm font-medium text-gray-900">{creator.lastCampaign}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex space-x-2">
                  <button className="flex-1 rounded-xl border border-white/20 bg-white/50 backdrop-blur-xl py-2 text-sm text-gray-700 hover:bg-white/80 transition-all duration-300">
                    View Details
                  </button>
                  <button className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl py-2 text-sm hover:from-blue-700 hover:to-purple-700 transition-all duration-300">
                    Message
                  </button>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Performance Metrics</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-sm text-gray-500">Reach Target</p>
                    <p className="text-lg font-semibold text-green-600">
                      {creator.performance.reachTarget}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-sm text-gray-500">Content Quality</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {creator.performance.contentQuality}
                    </p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-sm text-gray-500">Response Time</p>
                    <p className="text-lg font-semibold text-purple-600">
                      {creator.performance.responseTime}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Posts */}
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Recent Campaign Posts</h4>
                <div className="grid grid-cols-3 gap-4">
                  {creator.recentPosts.map((post, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={index}
                      src={post}
                      alt={`Recent post ${index + 1} by ${creator.name}`}
                      className="h-24 w-full object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
