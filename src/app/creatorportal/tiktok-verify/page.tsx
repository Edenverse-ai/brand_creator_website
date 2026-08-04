"use client";

import { useState } from "react";
import { Upload, FileText, ExternalLink, Save, Check, Info, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  generateUploadUrls,
  uploadMultipleFiles,
  getFileExtension,
  FileUploadInfo,
} from "./uploadHelper";
import { resolveTikTokVerifyFileSelection } from "@/lib/tiktok-verify-upload";

export default function TikTokVerify() {
  const router = useRouter();

  // Form state - renamed to match backend parameters
  const [formData, setFormData] = useState({
    // Identity Information
    passport_name: "",
    nationality: "",
    real_name: "",
    stage_name: "",
    id_type: "passport",
    id_number: "",
    gender: "",
    date_of_birth: "",
    id_front_file: null,
    handheld_id_file: null,

    // Influencer Information
    account_intro: "",
    overseas_platform_url: "",
    follower_count: "",
    backend_ss_file: null,
    other_platforms: "",

    // Cooperation Information
    signed_auth_file: null,
    agent_email: "@bytedance.com",
    identity_video_file: null,

    // Terms agreement
    termsAgreed: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, _setSubmitSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "completed" | "error">(
    "idle"
  );
  const [currentUploadStep, setCurrentUploadStep] = useState<string>("");

  // Handle input changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    // Clear error when field is edited
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: "",
      });
    }
  };

  // Handle file uploads
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (!files || files.length === 0) return;

    const file = files[0];
    const extension = getFileExtension(file.name);

    // Pre-flight check: reject a file the server's allowlist would reject anyway,
    // immediately and with an accurate message — not after a round trip to
    // /api/tiktokverification/upload-urls. `accept` on each <input type="file"> below
    // is only a file-picker hint (drag-and-drop ignores it entirely, and some pickers
    // let users override it), so this is the real client-side gate.
    //
    // resolveTikTokVerifyFileSelection returns `file: null` on rejection — always
    // write that into formData below (never skip it). Otherwise a user replacing an
    // already-selected valid file with a rejected one keeps the OLD file silently in
    // form state while the input looks empty, and unknowingly resubmits it believing
    // the swap happened.
    const { file: resolvedFile, error } = resolveTikTokVerifyFileSelection(file, extension);

    setFormData({
      ...formData,
      [name]: resolvedFile,
    });
    setFormErrors({
      ...formErrors,
      [name]: error,
    });

    if (!resolvedFile) {
      e.target.value = "";
    }
  };

  // Handle checkbox changes
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData({
      ...formData,
      [name]: checked,
    });
  };

  // Format date to mm/dd/yy
  const formatDate = (isoDate: string): string => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(2);
    return `${month}/${day}/${year}`;
  };

  // Validate form
  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Required fields validation
    if (!formData.passport_name) errors.passport_name = "Passport name is required";
    if (!formData.nationality) errors.nationality = "Nationality is required";
    if (!formData.real_name) errors.real_name = "Real name is required";
    if (!formData.id_type) errors.id_type = "ID type is required";
    if (!formData.id_number) errors.id_number = "ID number is required";
    if (!formData.gender) errors.gender = "Gender is required";
    if (!formData.date_of_birth) errors.date_of_birth = "Date of birth is required";
    if (!formData.id_front_file) errors.id_front_file = "ID front image is required";
    if (!formData.handheld_id_file) errors.handheld_id_file = "Handheld ID photo is required";
    if (!formData.account_intro) errors.account_intro = "Account introduction is required";
    if (!formData.overseas_platform_url) errors.overseas_platform_url = "Platform URL is required";
    if (!formData.follower_count) errors.follower_count = "Follower count is required";
    if (!formData.backend_ss_file) errors.backend_ss_file = "Backend screenshot is required";
    if (!formData.signed_auth_file)
      errors.signed_auth_file = "Signed authorization file is required";
    if (!formData.agent_email || !formData.agent_email.includes("@bytedance.com"))
      errors.agent_email = "Valid ByteDance email is required";
    if (!formData.termsAgreed) errors.termsAgreed = "You must agree to the terms and conditions";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission with direct upload
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setUploadStatus("idle");
    setUploadProgress({});

    if (validateForm()) {
      setIsSubmitting(true);

      try {
        // Step 1: Prepare files for upload
        setCurrentUploadStep("Preparing files...");
        setUploadStatus("uploading");

        const filesToUpload: FileUploadInfo[] = [];

        // Add required files
        if (formData.id_front_file) {
          filesToUpload.push({
            key: "id_front_file",
            extension: getFileExtension((formData.id_front_file as File).name),
            file: formData.id_front_file as File,
          });
        }

        if (formData.handheld_id_file) {
          filesToUpload.push({
            key: "handheld_id_file",
            extension: getFileExtension((formData.handheld_id_file as File).name),
            file: formData.handheld_id_file as File,
          });
        }

        if (formData.backend_ss_file) {
          filesToUpload.push({
            key: "backend_ss_file",
            extension: getFileExtension((formData.backend_ss_file as File).name),
            file: formData.backend_ss_file as File,
          });
        }

        if (formData.signed_auth_file) {
          filesToUpload.push({
            key: "signed_auth_file",
            extension: getFileExtension((formData.signed_auth_file as File).name),
            file: formData.signed_auth_file as File,
          });
        }

        // Add optional video file
        if (formData.identity_video_file) {
          filesToUpload.push({
            key: "identity_video_file",
            extension: getFileExtension((formData.identity_video_file as File).name),
            file: formData.identity_video_file as File,
          });
        }

        let filePaths: Record<string, string> = {};

        if (filesToUpload.length > 0) {
          // Step 2: Generate upload URLs
          setCurrentUploadStep("Generating upload URLs...");
          const uploadUrlsResponse = await generateUploadUrls(formData.id_number, filesToUpload);

          if (!uploadUrlsResponse.success) {
            throw new Error("Failed to generate upload URLs");
          }

          // Step 3: Upload files directly to Supabase
          setCurrentUploadStep("Uploading files...");
          filePaths = await uploadMultipleFiles(
            filesToUpload,
            uploadUrlsResponse.upload_urls,
            (fileKey, progress) => {
              setUploadProgress((prev) => ({ ...prev, [fileKey]: progress }));
            },
            (fileKey) => {
              console.log(`Completed upload: ${fileKey}`);
            }
          );
        }

        // Step 4: Submit form data with file paths
        setCurrentUploadStep("Submitting verification...");
        setUploadStatus("completed");

        const submissionData = {
          // Text fields
          passport_name: formData.passport_name,
          real_name: formData.real_name,
          id_type: formData.id_type,
          gender: formData.gender,
          nationality: formData.nationality,
          stage_name: formData.stage_name || undefined,
          id_number: formData.id_number,
          date_of_birth: formatDate(formData.date_of_birth),
          account_intro: formData.account_intro,
          overseas_platform_url: formData.overseas_platform_url,
          follower_count: parseInt(formData.follower_count),
          other_platforms: formData.other_platforms || undefined,
          agent_email: formData.agent_email,
          // File paths (instead of files)
          file_paths: filePaths,
        };

        // Submit to API with JSON data instead of FormData
        const response = await fetch("/api/tiktokverification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submissionData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Error submitting form");
        }

        // Redirect to success page
        router.push("/creatorportal/tiktok-verify/success");
      } catch (error) {
        console.error("Form submission error:", error);
        setApiError(error instanceof Error ? error.message : "Failed to submit form");
        setUploadStatus("error");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Scroll to first error
      const firstErrorField = Object.keys(formErrors)[0];
      const element = document.getElementsByName(firstErrorField)[0];
      if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Handle save draft
  const handleSaveDraft = () => {
    // Logic to save draft
    alert("Draft saved successfully!");
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Overseas Influencer Account Registration Application
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Complete this form to register as an overseas influencer for TikTok promotional
            opportunities
          </p>
        </div>
      </div>

      {/* Success Message */}
      {submitSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Check className="h-5 w-5 text-green-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Registration submitted successfully
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>
                  Your application has been received. We will review your information and contact
                  you shortly.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Error Message */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Submission failed</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{apiError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Section 1: Identity Information */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Identity Information</h2>
            <p className="mt-1 text-sm text-gray-600">
              Please provide your personal identification details
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Passport Name */}
              <div>
                <label htmlFor="passport_name" className="block text-sm font-medium text-gray-700">
                  Passport Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="passport_name"
                  id="passport_name"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.passport_name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.passport_name}
                  onChange={handleChange}
                />
                {formErrors.passport_name && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.passport_name}</p>
                )}
              </div>

              {/* Nationality */}
              <div>
                <label htmlFor="nationality" className="block text-sm font-medium text-gray-700">
                  Nationality <span className="text-red-500">*</span>
                </label>
                <select
                  name="nationality"
                  id="nationality"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.nationality
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.nationality}
                  onChange={handleChange}
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
                {formErrors.nationality && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.nationality}</p>
                )}
              </div>

              {/* Real Name */}
              <div>
                <label htmlFor="real_name" className="block text-sm font-medium text-gray-700">
                  Real Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="real_name"
                  id="real_name"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.real_name
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.real_name}
                  onChange={handleChange}
                />
                {formErrors.real_name && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.real_name}</p>
                )}
              </div>

              {/* Stage Name */}
              <div>
                <label htmlFor="stage_name" className="block text-sm font-medium text-gray-700">
                  Stage Name (Optional)
                </label>
                <input
                  type="text"
                  name="stage_name"
                  id="stage_name"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={formData.stage_name}
                  onChange={handleChange}
                />
              </div>

              {/* ID Type */}
              <div>
                <label htmlFor="id_type" className="block text-sm font-medium text-gray-700">
                  ID Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="id_type"
                  id="id_type"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.id_type
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.id_type}
                  onChange={handleChange}
                >
                  <option value="passport">Passport</option>
                  <option value="driverLicense">Driver&apos;s License</option>
                  <option value="nationalId">National ID Card</option>
                  <option value="other">Other Government ID</option>
                </select>
                {formErrors.id_type && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.id_type}</p>
                )}
              </div>

              {/* ID Number */}
              <div>
                <label htmlFor="id_number" className="block text-sm font-medium text-gray-700">
                  ID Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="id_number"
                  id="id_number"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.id_number
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.id_number}
                  onChange={handleChange}
                />
                {formErrors.id_number && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.id_number}</p>
                )}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="mt-2 space-x-6">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="gender"
                      value="male"
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                      checked={formData.gender === "male"}
                      onChange={handleChange}
                    />
                    <span className="ml-2 text-sm text-gray-700">Male</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="gender"
                      value="female"
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                      checked={formData.gender === "female"}
                      onChange={handleChange}
                    />
                    <span className="ml-2 text-sm text-gray-700">Female</span>
                  </label>
                </div>
                {formErrors.gender && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.gender}</p>
                )}
              </div>

              {/* Date of Birth */}
              <div>
                <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  id="date_of_birth"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.date_of_birth
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.date_of_birth}
                  onChange={handleChange}
                />
                {formErrors.date_of_birth && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.date_of_birth}</p>
                )}
              </div>
            </div>

            {/* ID Front Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Upload ID Front <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="id_front_file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                    >
                      <span>Upload a file</span>
                      <input
                        id="id_front_file"
                        name="id_front_file"
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  {formData.id_front_file && (
                    <p className="text-xs text-green-500">
                      File selected: {(formData.id_front_file as File).name}
                    </p>
                  )}
                </div>
              </div>
              {formErrors.id_front_file && (
                <p className="mt-1 text-sm text-red-600">{formErrors.id_front_file}</p>
              )}
            </div>

            {/* Handheld ID Photo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Upload Handheld ID Photo <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Please take a photo of yourself holding your ID for verification purposes
              </p>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="handheld_id_file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                    >
                      <span>Upload a file</span>
                      <input
                        id="handheld_id_file"
                        name="handheld_id_file"
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  {formData.handheld_id_file && (
                    <p className="text-xs text-green-500">
                      File selected: {(formData.handheld_id_file as File).name}
                    </p>
                  )}
                </div>
              </div>
              {formErrors.handheld_id_file && (
                <p className="mt-1 text-sm text-red-600">{formErrors.handheld_id_file}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Influencer Information */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Influencer Information</h2>
            <p className="mt-1 text-sm text-gray-600">Tell us about your social media presence</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Account Introduction */}
            <div>
              <label htmlFor="account_intro" className="block text-sm font-medium text-gray-700">
                Account Introduction <span className="text-red-500">*</span>
              </label>
              <textarea
                name="account_intro"
                id="account_intro"
                rows={4}
                className={`mt-1 block w-full rounded-md shadow-sm ${
                  formErrors.account_intro
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                    : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                }`}
                placeholder="Describe your content style, audience demographics, and typical engagement"
                value={formData.account_intro}
                onChange={handleChange}
              />
              {formErrors.account_intro && (
                <p className="mt-1 text-sm text-red-600">{formErrors.account_intro}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Platform URL */}
              <div>
                <label
                  htmlFor="overseas_platform_url"
                  className="block text-sm font-medium text-gray-700"
                >
                  Overseas Platform URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  name="overseas_platform_url"
                  id="overseas_platform_url"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.overseas_platform_url
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  placeholder="https://www.example.com/your-profile"
                  value={formData.overseas_platform_url}
                  onChange={handleChange}
                />
                {formErrors.overseas_platform_url && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.overseas_platform_url}</p>
                )}
              </div>

              {/* Follower Count */}
              <div>
                <label htmlFor="follower_count" className="block text-sm font-medium text-gray-700">
                  Follower Count <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="follower_count"
                  id="follower_count"
                  className={`mt-1 block w-full rounded-md shadow-sm ${
                    formErrors.follower_count
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  min="0"
                  value={formData.follower_count}
                  onChange={handleChange}
                />
                {formErrors.follower_count && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.follower_count}</p>
                )}
              </div>
            </div>

            {/* Backend Screenshot Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Upload Backend Screenshot <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Please provide a screenshot of your account analytics/dashboard showing follower
                count
              </p>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="backend_ss_file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                    >
                      <span>Upload a file</span>
                      <input
                        id="backend_ss_file"
                        name="backend_ss_file"
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  {formData.backend_ss_file && (
                    <p className="text-xs text-green-500">
                      File selected: {(formData.backend_ss_file as File).name}
                    </p>
                  )}
                </div>
              </div>
              {formErrors.backend_ss_file && (
                <p className="mt-1 text-sm text-red-600">{formErrors.backend_ss_file}</p>
              )}
            </div>

            {/* Other Platforms */}
            <div>
              <label htmlFor="other_platforms" className="block text-sm font-medium text-gray-700">
                Other Platforms Joined (Optional)
              </label>
              <input
                type="text"
                name="other_platforms"
                id="other_platforms"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Instagram, YouTube, etc."
                value={formData.other_platforms}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Cooperation Information */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Cooperation Information</h2>
            <p className="mt-1 text-sm text-gray-600">Complete the authorization process</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Authorization Template */}
            <div>
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-blue-500" />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Authorization Template
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Please download, fill out, and sign the authorization template below.
              </p>
              <a
                href="https://ldlxyyctxylgmstfqlzh.supabase.co/storage/v1/object/sign/terms/authorization_temp.pdf?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ0ZXJtcy9hdXRob3JpemF0aW9uX3RlbXAucGRmIiwiaWF0IjoxNzQ2NjM4MDExLCJleHAiOjIzNzczNTgwMTF9.N_OzVc84s8rygGnviU5WR8I_H83N_GTUyDfkGRg9oqs"
                target="_blank"
                rel="noopener noreferrer"
                download="TikTok_Authorization_Template.pdf"
                className="mt-2 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Download Authorization Template
              </a>
            </div>

            {/* Signed Authorization File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Upload Signed Authorization File <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="signed_auth_file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                    >
                      <span>Upload a file</span>
                      <input
                        id="signed_auth_file"
                        name="signed_auth_file"
                        type="file"
                        className="sr-only"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PDF, JPG, PNG up to 10MB</p>
                  {formData.signed_auth_file && (
                    <p className="text-xs text-green-500">
                      File selected: {(formData.signed_auth_file as File).name}
                    </p>
                  )}
                </div>
              </div>
              {formErrors.signed_auth_file && (
                <p className="mt-1 text-sm text-red-600">{formErrors.signed_auth_file}</p>
              )}
            </div>

            {/* Agent Email */}
            <div>
              <label htmlFor="agent_email" className="block text-sm font-medium text-gray-700">
                Agent Email <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  name="agent_email"
                  id="agent_email"
                  className={`flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md ${
                    formErrors.agent_email
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  value={formData.agent_email.split("@")[0]}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      agent_email: e.target.value + "@bytedance.com",
                    })
                  }
                />
                <span className="inline-flex items-center px-3 py-2 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                  @bytedance.com
                </span>
              </div>
              {formErrors.agent_email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.agent_email}</p>
              )}
            </div>

            {/* Identity Video Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Upload Identity Video (Optional)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                A short video introducing yourself and showing your ID can expedite verification
              </p>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="identity_video_file"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                    >
                      <span>Upload a file</span>
                      <input
                        id="identity_video_file"
                        name="identity_video_file"
                        type="file"
                        className="sr-only"
                        accept="video/*"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">MP4, MOV up to 50MB</p>
                  {formData.identity_video_file && (
                    <p className="text-xs text-green-500">
                      File selected: {(formData.identity_video_file as File).name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-6">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="termsAgreed"
                  name="termsAgreed"
                  type="checkbox"
                  className={`focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded ${
                    formErrors.termsAgreed ? "border-red-300" : ""
                  }`}
                  checked={formData.termsAgreed}
                  onChange={handleCheckboxChange}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="termsAgreed" className="font-medium text-gray-700">
                  I agree to the terms and conditions <span className="text-red-500">*</span>
                </label>
                <p className="text-gray-500">
                  By checking this box, you agree to our{" "}
                  <a
                    href="https://ldlxyyctxylgmstfqlzh.supabase.co/storage/v1/object/sign/terms/Terms.pdf?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ0ZXJtcy9UZXJtcy5wZGYiLCJpYXQiOjE3NDY2MzkzMTMsImV4cCI6MjA2MTk5OTMxM30.ONaP6D4wReFTY5z6MuXzX3cm3WKJHqwxceIwncJpDIQ"
                    className="text-blue-600 hover:text-blue-500"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://ldlxyyctxylgmstfqlzh.supabase.co/storage/v1/object/sign/terms/Privacy%20Policy.pdf?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJ0ZXJtcy9Qcml2YWN5IFBvbGljeS5wZGYiLCJpYXQiOjE3NDY2Mzg4NDUsImV4cCI6MjA2MTk5ODg0NX0.x-zvJQc76-FnGAyUWhBW95PeaV9_4UNm8n7cKM6vko0"
                    className="text-blue-600 hover:text-blue-500"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                  .
                </p>
                {formErrors.termsAgreed && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.termsAgreed}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadStatus !== "idle" && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex items-center">
              <Info className="h-5 w-5 text-blue-400 mr-2" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-800">
                  {uploadStatus === "uploading" && "Uploading Files..."}
                  {uploadStatus === "completed" && "Upload Complete!"}
                  {uploadStatus === "error" && "Upload Error"}
                </h3>
                <p className="text-sm text-blue-700 mt-1">{currentUploadStep}</p>

                {uploadStatus === "uploading" && Object.keys(uploadProgress).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(uploadProgress).map(([fileKey, progress]) => (
                      <div key={fileKey} className="flex items-center justify-between">
                        <span className="text-xs text-blue-600 capitalize">
                          {fileKey.replace("_file", "").replace("_", " ")}
                        </span>
                        <div className="flex items-center ml-4">
                          <div className="w-24 bg-blue-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-blue-600 w-10 text-right">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex space-x-4 justify-end">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              isSubmitting ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </form>

      {/* Help Information */}
      <div className="mt-8 bg-blue-50 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Need help?</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                If you have any questions about the application process, please contact our support
                team at{" "}
                <a href="mailto:creator-support@bytedance.com" className="font-medium underline">
                  creator-support@bytedance.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
