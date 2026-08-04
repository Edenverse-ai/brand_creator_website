"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Calendar } from "lucide-react";
import Link from "next/link";
import { validateCampaignImageFile, uploadCampaignImage } from "@/lib/campaign-image-upload";

interface Platform {
  id: string;
  name: string;
  displayName: string;
}

export default function EditCampaign() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();

  // Add null check and type safety for campaignId
  const campaignId = params?.id as string | undefined;

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [_originalCampaign, setOriginalCampaign] = useState<any>(null);

  // State for managing dropdown sections
  const [expandedSections, setExpandedSections] = useState({
    campaignInfo: true,
    productInfo: true,
    budgetCreator: true,
  });

  // Form state with new fields - same as new campaign page
  const [formData, setFormData] = useState({
    title: "",
    brief: "",
    requirements: "",
    budget_range: "",
    budgetUnit: "total",
    commission: "",
    platform: "",
    deadline: "",
    max_creators: 10,
    is_open: true,
    sample_video_url: "",
    industry_category: "",
    primary_promotion_objectives: [] as string[],
    ad_placement: "disable",
    campaign_execution_mode: "direct",
    creator_profile_preferences_gender: [] as string[],
    creator_profile_preference_ethnicity: [] as string[],
    creator_profile_preference_content_niche: [] as string[],
    preferred_creator_location: [] as string[],
    language_requirement_for_creators: "english",
    creator_tier_requirement: [] as string[],
    send_to_creator: "yes",
    approved_by_brand: "yes",
    kpi_reference_target: "",
    prohibited_content_warnings: "",
    posting_requirements: "",
    product_photo: null as File | null,
    product_photo_url: "",
    script_required: "no",
    product_name: "",
    product_highlight: "",
    product_price: "",
    product_sold_number: "",
    paid_promotion_type: "commission_based",
    video_buyout_budget_range: "",
    base_fee_budget_range: "",
    follower_requirement: "",
    order_requirement: "",
  });

  // Constants for the dropdown and multi-select options (same as new campaign page)
  const industryCategories = [
    "Fast-Moving Consumer Goods (FMCG)",
    "Apparel & Accessories",
    "Retail",
    "Gaming",
    "Food & Beverage",
    "Utility Software",
    "Lifestyle Services",
    "Culture, Sports & Entertainment",
    "Media & Content",
    "3C & Electronics",
    "Other",
  ];

  const promotionObjectives = [
    "Brand Awareness",
    "E-commerce Sales",
    "App Downloads / Registrations",
    "Drive Traffic to Official Website",
    "Grow TikTok Followers",
    "Other",
  ];

  const _contentNiches = [
    "Beauty",
    "Food",
    "Comedy / Skits",
    "Lifestyle",
    "Fashion",
    "Parenting / Family",
    "Reviews",
    "Travel",
    "Automotive",
    "Sports / Fitness",
    "Pets",
    "Other",
  ];

  const _locations = [
    "United States (priority)",
    "Any English-speaking country (e.g., US, UK, Canada)",
    "Spanish-speaking countries (e.g., Mexico, Colombia, Spain)",
    "Other countries",
    "No geographic preference",
  ];

  const followerRequirements = [
    { value: "", label: "No Requirement" },
    { value: "S+ - >50w followers", label: "S+ - >50w followers" },
    { value: "S - 10-50w followers", label: "S - 10-50w followers" },
    { value: "A - 5-10w followers", label: "A - 5-10w followers" },
    { value: "B - 1-5w followers", label: "B - 1-5w followers" },
    { value: "C - 0-1w followers", label: "C - 0-1w followers" },
  ];

  const orderRequirements = [
    { value: "", label: "No Requirement" },
    { value: "5000-10,000+ orders/month", label: "5000-10,000+ orders/month" },
    { value: "500-5000 orders/month", label: "500-5000 orders/month" },
    { value: "200-500 orders/month", label: "200-500 orders/month" },
    { value: "50-200 orders/month", label: "50-200 orders/month" },
    { value: "1-50 orders/month", label: "1-50 orders/month" },
  ];

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && session?.user?.role !== "BRAND") {
      router.push("/login");
    }

    // Only fetch if we have a valid campaignId
    if (campaignId) {
      fetchPlatforms();
      fetchCampaign();
    }
    // fetchPlatforms/fetchCampaign are recreated every render; only re-run this effect for
    // actual navigation/identity changes, matching the pre-existing (unrelated to this task)
    // behavior of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, router, campaignId]);

  const fetchPlatforms = async () => {
    try {
      const response = await fetch("/api/platforms");
      if (!response.ok) {
        throw new Error("Failed to fetch platforms");
      }
      const data = await response.json();
      setPlatforms(data);
    } catch (error) {
      console.error("Error fetching platforms:", error);
    }
  };

  const fetchCampaign = async () => {
    if (!campaignId) return;

    try {
      setIsFetching(true);
      const response = await fetch(`/api/brand/campaigns/${campaignId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch campaign");
      }
      const campaign = await response.json();
      setOriginalCampaign(campaign);

      // Parse and populate form data
      const parseArrayField = (field: string | null): string[] => {
        if (!field) return [];
        try {
          return JSON.parse(field);
        } catch (_e) {
          return field.split(",").map((item) => item.trim());
        }
      };

      // Parse creator tier requirement to separate follower and order requirements
      const creatorTierRequirement = parseArrayField(campaign.creator_tier_requirement);
      let followerReq = "";
      let orderReq = "";

      if (creatorTierRequirement.length > 0) {
        const requirement = creatorTierRequirement[0];
        if (requirement.includes(";")) {
          const parts = requirement.split(";").map((p) => p.trim());
          followerReq = parts[0] || "";
          orderReq = parts[1] || "";
        } else {
          if (requirement.includes("followers")) {
            followerReq = requirement;
          } else if (requirement.includes("orders")) {
            orderReq = requirement;
          }
        }
      }

      setFormData({
        title: campaign.title || "",
        brief: campaign.brief || "",
        requirements: campaign.requirements || "",
        budget_range: campaign.budget_range || "",
        budgetUnit: campaign.budget_unit || "total",
        commission: campaign.commission || "",
        platform: campaign.platform || "",
        deadline: campaign.deadline ? campaign.deadline.split("T")[0] : "",
        max_creators: campaign.max_creators || 10,
        is_open: campaign.is_open !== false,
        sample_video_url: campaign.sample_video_url || "",
        industry_category: campaign.industry_category || "",
        primary_promotion_objectives: parseArrayField(campaign.primary_promotion_objectives),
        ad_placement: campaign.ad_placement || "disable",
        campaign_execution_mode: campaign.campaign_execution_mode || "direct",
        creator_profile_preferences_gender: parseArrayField(
          campaign.creator_profile_preferences_gender
        ),
        creator_profile_preference_ethnicity: parseArrayField(
          campaign.creator_profile_preference_ethnicity
        ),
        creator_profile_preference_content_niche: parseArrayField(
          campaign.creator_profile_preference_content_niche
        ),
        preferred_creator_location: parseArrayField(campaign.preferred_creator_location),
        language_requirement_for_creators: campaign.language_requirement_for_creators || "english",
        creator_tier_requirement: creatorTierRequirement,
        send_to_creator: campaign.send_to_creator || "yes",
        approved_by_brand: campaign.approved_by_brand || "yes",
        kpi_reference_target: campaign.kpi_reference_target || "",
        prohibited_content_warnings: campaign.prohibited_content_warnings || "",
        posting_requirements: campaign.posting_requirements || "",
        product_photo: null,
        // Fix the field mapping - use product_photo not product_photo_url
        product_photo_url: campaign.product_photo || "",
        script_required: campaign.script_required || "no",
        product_name: campaign.product_name || "",
        product_highlight: campaign.product_highlight || "",
        product_price: campaign.product_price || "",
        product_sold_number: campaign.product_sold_number || "",
        paid_promotion_type: campaign.paid_promotion_type || "commission_based",
        video_buyout_budget_range: campaign.video_buyout_budget_range || "",
        base_fee_budget_range: campaign.base_fee_budget_range || "",
        follower_requirement: followerReq,
        order_requirement: orderReq,
      });
    } catch (error) {
      console.error("Error fetching campaign:", error);
      setFormError("Failed to load campaign data");
    } finally {
      setIsFetching(false);
    }
  };

  // Same form handling functions as new campaign page
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };

      if (name === "follower_requirement" || name === "order_requirement") {
        const followerReq = name === "follower_requirement" ? value : prev.follower_requirement;
        const orderReq = name === "order_requirement" ? value : prev.order_requirement;

        if (followerReq && orderReq) {
          newData.creator_tier_requirement = [`${followerReq}; ${orderReq}`];
        } else if (followerReq) {
          newData.creator_tier_requirement = [followerReq];
        } else if (orderReq) {
          newData.creator_tier_requirement = [orderReq];
        } else {
          newData.creator_tier_requirement = [];
        }
      }

      return newData;
    });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({ ...prev, product_photo: e.target.files![0] }));
    }
  };

  const handleMultiSelectToggle = (field: string, value: string) => {
    setFormData((prev) => {
      const currentValues = prev[field as keyof typeof prev] as string[];
      if (Array.isArray(currentValues)) {
        return {
          ...prev,
          [field]: currentValues.includes(value)
            ? currentValues.filter((v) => v !== value)
            : [...currentValues, value],
        };
      }
      return prev;
    });
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!campaignId) {
      setFormError("Invalid campaign ID");
      return;
    }

    setIsLoading(true);
    setFormError(null);

    if (!formData.title.trim()) {
      setFormError("Campaign title is required");
      setIsLoading(false);
      return;
    }

    if (formData.product_photo) {
      const photoValidation = validateCampaignImageFile(formData.product_photo);
      if (!photoValidation.ok) {
        setFormError(photoValidation.error);
        setIsLoading(false);
        return;
      }
    }

    try {
      let productPhotoUrl = formData.product_photo_url;

      // Upload new photo if provided (direct-to-storage via presigned URL)
      if (formData.product_photo) {
        productPhotoUrl = await uploadCampaignImage(formData.product_photo);
      }

      // Prepare update data
      const updateData = { ...formData };
      delete (updateData as any).product_photo;
      if (productPhotoUrl) {
        (updateData as any).product_photo_url = productPhotoUrl;
      }

      const response = await fetch(`/api/brand/campaigns/${campaignId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update campaign");
      }

      router.push("/brandportal/campaigns");
    } catch (error) {
      console.error("Error updating campaign:", error);
      setFormError(error instanceof Error ? error.message : "Failed to update campaign");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || isFetching) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!campaignId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Invalid campaign ID</p>
          <Link href="/brandportal/campaigns" className="text-red-600 hover:text-red-800 underline">
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-6">
          <Link
            href="/brandportal/campaigns"
            className="flex items-center text-purple-600 hover:text-purple-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campaigns
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-6">Edit Campaign</h1>

        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {formError}
          </div>
        )}

        {/* Form content - same structure as new campaign page but with populated data */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6">
          {/* Campaign Information Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection("campaignInfo")}
              className="w-full flex items-center justify-between text-xl font-semibold mb-4 pb-2 border-b hover:text-purple-600 transition-colors"
            >
              <span>Campaign Information</span>
              <svg
                className={`w-5 h-5 transform transition-transform ${expandedSections.campaignInfo ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.campaignInfo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Campaign Title */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campaign Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., Summer Fashion Collection Launch"
                    required
                  />
                </div>

                {/* Campaign Brief */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campaign Brief
                  </label>
                  <textarea
                    name="brief"
                    value={formData.brief}
                    onChange={handleInputChange}
                    rows={4}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Describe what this campaign is about and what you're looking for"
                  />
                </div>

                {/* Requirements */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Requirements
                  </label>
                  <textarea
                    name="requirements"
                    value={formData.requirements}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Specific requirements for creators"
                  />
                </div>

                {/* Industry Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Industry Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="industry_category"
                    value={formData.industry_category}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">Select an industry</option>
                    {industryCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Platform */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                  <select
                    name="platform"
                    value={formData.platform}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select a platform</option>
                    {platforms.map((platform) => (
                      <option key={platform.id} value={platform.name}>
                        {platform.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Primary Promotion Objectives */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Primary Promotion Objectives (select all that apply)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {promotionObjectives.map((objective) => (
                      <div key={objective} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`objective-${objective}`}
                          checked={formData.primary_promotion_objectives.includes(objective)}
                          onChange={() =>
                            handleMultiSelectToggle("primary_promotion_objectives", objective)
                          }
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                        <label
                          htmlFor={`objective-${objective}`}
                          className="ml-2 text-sm text-gray-700"
                        >
                          {objective}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Deadline */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="date"
                      name="deadline"
                      value={formData.deadline}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Max Creators */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum Creators
                  </label>
                  <input
                    type="number"
                    name="max_creators"
                    value={formData.max_creators}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Is Open */}
                <div>
                  <div className="flex items-center h-full">
                    <input
                      type="checkbox"
                      id="is_open"
                      name="is_open"
                      checked={formData.is_open}
                      onChange={handleCheckboxChange}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_open" className="ml-2 block text-sm text-gray-700">
                      Open for Applications
                    </label>
                  </div>
                </div>

                {/* Sample Video URL */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sample Video URL
                  </label>
                  <input
                    type="url"
                    name="sample_video_url"
                    value={formData.sample_video_url}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="https://example.com/video"
                    pattern="https://.*"
                    title="URL must start with https://"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Provide a secure URL (https://) to a sample video showcasing desired content
                    style
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Product Information Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection("productInfo")}
              className="w-full flex items-center justify-between text-xl font-semibold mb-4 pb-2 border-b hover:text-purple-600 transition-colors"
            >
              <span>Product Information</span>
              <svg
                className={`w-5 h-5 transform transition-transform ${expandedSections.productInfo ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.productInfo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Upload a photo of the product being promoted
                  </p>
                  {formData.product_photo_url && (
                    <div className="mt-2">
                      <p className="text-sm text-gray-600">Current photo:</p>
                      <a
                        href={formData.product_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View current photo
                      </a>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    name="product_name"
                    value={formData.product_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter product name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Price
                  </label>
                  <input
                    type="text"
                    name="product_price"
                    value={formData.product_price}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., $29.99"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Budget & Creator Preferences Section */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => toggleSection("budgetCreator")}
              className="w-full flex items-center justify-between text-xl font-semibold mb-4 pb-2 border-b hover:text-purple-600 transition-colors"
            >
              <span>Budget & Creator Preferences</span>
              <svg
                className={`w-5 h-5 transform transition-transform ${expandedSections.budgetCreator ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {expandedSections.budgetCreator && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Commission */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commission</label>
                  <input
                    type="text"
                    name="commission"
                    value={formData.commission}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., 15% per sale"
                  />
                </div>

                {/* Creator Tier Requirements */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Creator Tier Requirements
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Follower Requirement Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Follower Requirement
                      </label>
                      <select
                        name="follower_requirement"
                        value={formData.follower_requirement}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {followerRequirements.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Monthly Order Requirement Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Monthly Order Requirement
                      </label>
                      <select
                        name="order_requirement"
                        value={formData.order_requirement}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {orderRequirements.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end">
            <Link
              href="/brandportal/campaigns"
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 mr-4 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className={`px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-300 ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {isLoading ? "Updating..." : "Update Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
