"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

interface Position {
  id: string;
  title: string;
  type: "creator" | "brand" | "other";
  requirements: string[];
  offer: string;
}

interface ApplicationFormData {
  // Identity Information
  passport_name: string;
  nationality: string;
  id_type: string;
  id_number: string;
  gender: string;
  date_of_birth: string;

  // Influencer Information
  account_intro: string;
  profile_url: string;
  follower_count: string;
  other_platforms: string;
}

const positions: Position[] = [
  {
    id: "1",
    title: "TikTok Live Streaming Creator",
    type: "creator",
    requirements: [
      "Language: English",
      "Category: Woman's beauty and personal care",
      "Followers: 300k+",
      "Need 4 pre-live video",
      "Need 4-hour live streaming",
    ],
    offer: "$100,000",
  },
];

function CareerPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<ApplicationFormData>({
    passport_name: "",
    nationality: "",
    id_type: "passport",
    id_number: "",
    gender: "",
    date_of_birth: "",
    account_intro: "",
    profile_url: "",
    follower_count: "",
    other_platforms: "",
  });

  // Check if user was redirected back after login
  useEffect(() => {
    if (!searchParams) return;

    const fromApply = searchParams.get("from");
    const positionId = searchParams.get("position");

    if (fromApply === "apply" && positionId && status === "authenticated") {
      const position = positions.find((p) => p.id === positionId);
      if (position && position.type === "creator") {
        setSelectedPosition(position);
        setShowApplicationModal(true);
        // Clean up URL
        window.history.replaceState({}, "", "/career");
      }
    }
  }, [searchParams, status]);

  const handleApplyClick = (position: Position) => {
    if (position.type === "creator") {
      // Check if user is logged in
      if (status === "unauthenticated") {
        // Show auth modal instead of direct redirect
        setSelectedPosition(position);
        setShowAuthModal(true);
      } else if (status === "authenticated") {
        // Show application modal
        setSelectedPosition(position);
        setShowApplicationModal(true);
      }
    } else {
      // For non-creator positions, just show alert for now
      alert(`Apply for ${position.title}`);
    }
  };

  const handleSignIn = () => {
    if (selectedPosition) {
      router.push(`/login?redirect=/career&from=apply&position=${selectedPosition.id}`);
    }
  };

  const handleJoinCreator = () => {
    if (selectedPosition) {
      router.push(`/join-creator?redirect=/career&from=apply&position=${selectedPosition.id}`);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();

    // Format data for API
    const applicationData = {
      position: selectedPosition?.title,
      positionId: selectedPosition?.id,
      applicantEmail: session?.user?.email,
      submittedAt: new Date().toISOString(),
      identityInformation: {
        passportName: formData.passport_name,
        nationality: formData.nationality,
        idType: formData.id_type,
        idNumber: formData.id_number,
        gender: formData.gender,
        dateOfBirth: formData.date_of_birth,
      },
      influencerInformation: {
        accountIntroduction: formData.account_intro,
        profileUrl: formData.profile_url,
        followerCount: formData.follower_count,
        otherPlatforms: formData.other_platforms || "N/A",
      },
    };

    try {
      // Send application to backend API
      const response = await fetch("/api/career/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(applicationData),
      });

      const result = await response.json();

      if (response.ok) {
        // Close modal and reset form
        setShowApplicationModal(false);
        setSelectedPosition(null);
        setFormData({
          passport_name: "",
          nationality: "",
          id_type: "passport",
          id_number: "",
          gender: "",
          date_of_birth: "",
          account_intro: "",
          profile_url: "",
          follower_count: "",
          other_platforms: "",
        });

        alert(
          "Application submitted successfully! A confirmation email has been sent to your email address."
        );
      } else {
        // Never log `result` or the submitted application: this form carries
        // passport name, ID number and date of birth.
        console.error("Application submission failed", { status: response.status });
        alert("Failed to submit application. Please try again.");
      }
    } catch (error) {
      console.error(
        "Error submitting application:",
        error instanceof Error ? error.name : "unknown error"
      );
      alert("An error occurred while submitting your application. Please try again.");
    }
  };
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-white sm:text-5xl md:text-6xl">
            Careers at Cricher.ai
          </h1>
          <p className="mt-4 text-xl text-purple-100 sm:text-2xl">We need you!</p>
        </div>
      </div>

      {/* Positions Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-6">
          {positions.map((position) => (
            <div
              key={position.id}
              className="bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300"
            >
              <div className="p-6 sm:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  {/* Left side: Position details */}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">{position.title}</h2>

                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">Requirements:</h3>
                      <ul
                        className={`space-y-2 ${position.requirements.length > 4 ? "max-h-40 overflow-y-auto pr-2" : ""}`}
                      >
                        {position.requirements.map((req, index) => (
                          <li key={index} className="flex items-start">
                            <span className="inline-block w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                            <span className="text-gray-600">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">What We Offer:</h3>
                      <p className="text-xl font-bold text-green-600">{position.offer}</p>
                    </div>
                  </div>

                  {/* Right side: Apply button */}
                  <div className="flex lg:items-start lg:justify-end">
                    <button
                      className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg whitespace-nowrap"
                      onClick={() => handleApplyClick(position)}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state message if no positions */}
        {positions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              No open positions at the moment. Check back soon!
            </p>
          </div>
        )}
      </div>

      {/* Authentication Modal */}
      {showAuthModal && selectedPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
            {/* Modal Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h2>
              <p className="text-gray-600">
                Please sign in to your creator account or join as a creator to apply for this
                position.
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleSignIn}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
              >
                Sign In
              </button>
              <button
                onClick={handleJoinCreator}
                className="w-full bg-white hover:bg-gray-50 text-purple-600 font-semibold py-3 px-6 rounded-lg border-2 border-purple-600 transition-colors duration-200"
              >
                Join as Creator
              </button>
              <button
                onClick={() => setShowAuthModal(false)}
                className="w-full text-gray-600 hover:text-gray-800 font-medium py-2 transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Application Modal */}
      {showApplicationModal && selectedPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                Apply for {selectedPosition.title}
              </h2>
              <button
                onClick={() => setShowApplicationModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmitApplication} className="p-6">
              {/* Section 1: Identity Information */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  Identity Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Passport Name */}
                  <div>
                    <label
                      htmlFor="passport_name"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Legal Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="passport_name"
                      id="passport_name"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      value={formData.passport_name}
                      onChange={handleInputChange}
                    />
                  </div>

                  {/* Nationality */}
                  <div>
                    <label
                      htmlFor="nationality"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Nationality <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="nationality"
                      id="nationality"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      value={formData.nationality}
                      onChange={handleInputChange}
                    >
                      <option value="">Select your nationality</option>
                      <option value="US">United States</option>
                      <option value="UK">United Kingdom</option>
                      <option value="CA">Canada</option>
                      <option value="AU">Australia</option>
                      <option value="JP">Japan</option>
                      <option value="KR">South Korea</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  {/* ID Type */}
                  <div>
                    <label
                      htmlFor="id_type"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      ID Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="id_type"
                      id="id_type"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      value={formData.id_type}
                      onChange={handleInputChange}
                    >
                      <option value="passport">Passport</option>
                      <option value="driverLicense">Driver&apos;s License</option>
                      <option value="nationalId">National ID Card</option>
                      <option value="other">Other Government ID</option>
                    </select>
                  </div>

                  {/* ID Number */}
                  <div>
                    <label
                      htmlFor="id_number"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      ID Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="id_number"
                      id="id_number"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      value={formData.id_number}
                      onChange={handleInputChange}
                    />
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gender <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-6 mt-2">
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name="gender"
                          value="male"
                          required
                          className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300"
                          checked={formData.gender === "male"}
                          onChange={handleInputChange}
                        />
                        <span className="ml-2 text-sm text-gray-700">Male</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name="gender"
                          value="female"
                          required
                          className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300"
                          checked={formData.gender === "female"}
                          onChange={handleInputChange}
                        />
                        <span className="ml-2 text-sm text-gray-700">Female</span>
                      </label>
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label
                      htmlFor="date_of_birth"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Date of Birth <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="date_of_birth"
                      id="date_of_birth"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Influencer Information */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
                  Influencer Information
                </h3>

                <div className="space-y-6">
                  {/* Account Introduction */}
                  <div>
                    <label
                      htmlFor="account_intro"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Account Introduction <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="account_intro"
                      id="account_intro"
                      rows={4}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Describe your content style, audience demographics, and typical engagement"
                      value={formData.account_intro}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Platform URL */}
                    <div>
                      <label
                        htmlFor="profile_url"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Social Media Profile URL <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="url"
                        name="profile_url"
                        id="profile_url"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="https://www.example.com/your-profile"
                        value={formData.profile_url}
                        onChange={handleInputChange}
                      />
                    </div>

                    {/* Follower Count */}
                    <div>
                      <label
                        htmlFor="follower_count"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Follower Count <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="follower_count"
                        id="follower_count"
                        required
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={formData.follower_count}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  {/* Other Platforms */}
                  <div>
                    <label
                      htmlFor="other_platforms"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Other Platforms (Optional)
                    </label>
                    <textarea
                      name="other_platforms"
                      id="other_platforms"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="List any other social media platforms where you have a presence"
                      value={formData.other_platforms}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowApplicationModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-md hover:shadow-lg"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CareerPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
    >
      <CareerPageContent />
    </Suspense>
  );
}
