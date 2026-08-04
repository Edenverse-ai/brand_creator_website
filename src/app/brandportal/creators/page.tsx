"use client";

import { Search, Filter, Instagram, Youtube } from "lucide-react";
import { TikTokIcon } from "@/components/ui/TikTokIcon";

const creators = [
  {
    name: "Sarah Johnson",
    handle: "@sarahjstyle",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
    category: "Fashion & Lifestyle",
    followers: "125K",
    engagement: "4.8%",
    platforms: ["instagram", "tiktok"],
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
    recentPosts: [
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=200",
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200",
      "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=200",
    ],
  },
  {
    name: "David Kim",
    handle: "@davidtravels",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
    category: "Travel & Adventure",
    followers: "180K",
    engagement: "4.5%",
    platforms: ["instagram", "youtube"],
    recentPosts: [
      "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=200",
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=200",
      "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=200",
    ],
  },
  {
    name: "Sophia Patel",
    handle: "@sophiabeauty",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
    category: "Beauty & Skincare",
    followers: "320K",
    engagement: "5.8%",
    platforms: ["instagram", "tiktok", "youtube"],
    recentPosts: [
      "https://images.unsplash.com/photo-1576426863848-c21f53c60b19?w=200",
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=200",
      "https://images.unsplash.com/photo-1560069014-a2ef9ae915a2?w=200",
    ],
  },
  {
    name: "Alex Rivera",
    handle: "@alexcooks",
    avatar: "https://images.unsplash.com/photo-1545912452-8aea7e25a3d3?w=100",
    category: "Food & Cooking",
    followers: "275K",
    engagement: "5.5%",
    platforms: ["instagram", "youtube", "tiktok"],
    recentPosts: [
      "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=200",
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=200",
      "https://images.unsplash.com/photo-1473093226795-af9932fe5856?w=200",
    ],
  },
  {
    name: "Maya Singh",
    handle: "@mayaarts",
    avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=100",
    category: "Art & Design",
    followers: "198K",
    engagement: "4.9%",
    platforms: ["instagram", "tiktok"],
    recentPosts: [
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=200",
      "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=200",
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=200",
    ],
  },
  {
    name: "James Wilson",
    handle: "@techwithjames",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    category: "Tech & Gaming",
    followers: "165K",
    engagement: "4.7%",
    platforms: ["youtube", "tiktok"],
    recentPosts: [
      "https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=200",
      "https://images.unsplash.com/photo-1587202372634-32705e3bf49c?w=200",
      "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=200",
    ],
  },
  {
    name: "Lily Zhang",
    handle: "@lilybeauty",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100",
    category: "Beauty & Skincare",
    followers: "220K",
    engagement: "5.3%",
    platforms: ["instagram", "youtube"],
    recentPosts: [
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200",
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200",
      "https://images.unsplash.com/photo-1576426863848-c21f53c60b19?w=200",
    ],
  },
  {
    name: "Tom Parker",
    handle: "@fitnesstom",
    avatar: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=100",
    category: "Fitness & Health",
    followers: "145K",
    engagement: "4.6%",
    platforms: ["instagram", "tiktok", "youtube"],
    recentPosts: [
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200",
      "https://images.unsplash.com/photo-1546483875-ad9014c88eba?w=200",
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200",
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
  tiktok: TikTokIcon,
};

export default function CreatorsPage() {
  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-gray-600">
        Discover and connect with talented creators who align with your brand&apos;s vision and
        values.
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
            placeholder="Search creators by name, category, or platform..."
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {creators.map((creator) => (
          <div
            key={creator.handle}
            className="overflow-hidden rounded-2xl backdrop-blur-xl bg-white/50 border border-white/20 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
          >
            <div className="p-6">
              <div className="flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={creator.avatar}
                  alt={creator.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">{creator.name}</h3>
                  <p className="text-sm text-gray-500">{creator.handle}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Category</span>
                  <span className="font-medium text-gray-900">{creator.category}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-500">Followers</span>
                  <span className="font-medium text-gray-900">{creator.followers}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-500">Engagement</span>
                  <span className="font-medium text-green-600">{creator.engagement}</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center space-x-2">
                  {creator.platforms.map((platform) => {
                    const Icon = platformIcons[platform as keyof typeof platformIcons];
                    return (
                      <div
                        key={platform}
                        className="p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-gray-900 mb-2">Recent Posts</p>
                <div className="grid grid-cols-3 gap-2">
                  {creator.recentPosts.map((post, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={index}
                      src={post}
                      alt={`Recent post ${index + 1} by ${creator.name}`}
                      className="h-20 w-full object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button className="flex-1 rounded-xl border border-white/20 bg-white/50 backdrop-blur-xl py-2 text-sm text-gray-700 hover:bg-white/80 transition-all duration-300">
                  View Profile
                </button>
                <button className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl py-2 text-sm hover:from-blue-700 hover:to-purple-700 transition-all duration-300">
                  Message
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
