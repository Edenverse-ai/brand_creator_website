from typing import Any

from pydantic import BaseModel, ConfigDict


class Campaign(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    brand_id: str | None = None
    title: str
    brief: str | None = None
    requirements: str | None = None
    budget_range: str | None = None
    budget_unit: str | None = "total"
    commission: str | None = None
    platform: str | None = None
    deadline: str | None = None
    max_creators: int | None = 10
    is_open: bool = True
    created_at: str | None = None
    brand_name: str | None = None
    sample_video_url: str | None = None
    # Add new fields
    industry_category: str | None = None
    primary_promotion_objectives: list[str] | str | None = None
    ad_placement: str | None = "disable"
    campaign_execution_mode: str | None = "direct"
    creator_profile_preferences_gender: list[str] | str | None = None
    creator_profile_preference_ethnicity: list[str] | str | None = None
    creator_profile_preference_content_niche: list[str] | str | None = None
    preferred_creator_location: list[str] | str | None = None
    language_requirement_for_creators: str | None = "english"
    creator_tier_requirement: list[str] | str | None = None
    send_to_creator: str | None = "yes"
    approved_by_brand: str | None = "yes"
    kpi_reference_target: str | None = None
    prohibited_content_warnings: str | None = None
    posting_requirements: str | None = None
    product_photo: str | None = None
    # New frontend fields
    script_required: str | None = "no"
    product_name: str | None = None
    product_highlight: str | None = None
    product_price: str | None = None
    product_sold_number: str | None = None
    paid_promotion_type: str | None = "commission_based"
    video_buyout_budget_range: str | None = None
    base_fee_budget_range: str | None = None


class CampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    brand_id: str
    title: str
    brief: str | None = None
    requirements: str | None = None
    budget_range: str | None = None
    budget_unit: str | None = "total"
    commission: str | None = None
    platform: str | None = None
    deadline: str | None = None
    max_creators: int | None = 10
    is_open: bool | None = True
    sample_video_url: str | None = None
    # Add new fields
    industry_category: str | None = None
    primary_promotion_objectives: list[str] | str | None = None
    ad_placement: str | None = "disable"
    campaign_execution_mode: str | None = "direct"
    creator_profile_preferences_gender: list[str] | str | None = None
    creator_profile_preference_ethnicity: list[str] | str | None = None
    creator_profile_preference_content_niche: list[str] | str | None = None
    preferred_creator_location: list[str] | str | None = None
    language_requirement_for_creators: str | None = "english"
    creator_tier_requirement: list[str] | str | None = None
    send_to_creator: str | None = "yes"
    approved_by_brand: str | None = "yes"
    kpi_reference_target: str | None = None
    prohibited_content_warnings: str | None = None
    posting_requirements: str | None = None
    product_photo: str | None = None
    # New frontend fields
    script_required: str | None = "no"
    product_name: str | None = None
    product_highlight: str | None = None
    product_price: str | None = None
    product_sold_number: str | None = None
    paid_promotion_type: str | None = "commission_based"
    video_buyout_budget_range: str | None = None
    base_fee_budget_range: str | None = None


class CampaignApplication(BaseModel):
    """Represents a campaign application along with optional creator metadata."""

    model_config = ConfigDict(extra="allow")
    id: str | None = None
    campaign_id: str | None = None
    creator_id: str | None = None
    status: str | None = None
    sample_text: str | None = None
    sample_video_url: str | None = None
    created_at: str | None = None
    creator: dict[str, Any] | None = None


class CampaignWithApplications(Campaign):
    applications: list[CampaignApplication] = []
    brand: dict[str, Any] | None = None


class CampaignMutationResponse(BaseModel):
    """Standard response envelope for campaign create/update/delete operations."""

    success: bool
    message: str
    campaign_id: str | None = None
    campaign_title: str | None = None


class BrandProfileStatus(BaseModel):
    """Represents the result of ensuring a brand profile exists."""

    exists: bool
    created: bool | None = None
    brand_profile: dict[str, Any] | None = None
    message: str
