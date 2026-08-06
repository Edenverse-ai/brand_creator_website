from pydantic import BaseModel, ConfigDict


class CampaignClaimCreate(BaseModel):
    campaign_id: str
    user_id: str  # Changed from creator_id to user_id
    sample_text: str | None = None
    sample_video_url: str | None = None


class CampaignClaimResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    campaign_id: str
    creator_id: str
    status: str
    sample_text: str | None = None
    sample_video_url: str | None = None
    created_at: str


class CampaignClaimExistsResponse(BaseModel):
    exists: bool


class CampaignClaimOperationResponse(BaseModel):
    success: bool | None = None
    status: str
    claim_id: str | None = None
    message: str | None = None


class CreatorCampaignClaim(BaseModel):
    """Creator-facing claim item enriched with campaign data."""

    model_config = ConfigDict(extra="allow")
    id: str | None = None
    creator_id: str | None = None
    campaign_id: str | None = None
    status: str | None = None
    sample_text: str | None = None
    sample_video_url: str | None = None
    created_at: str | None = None
    campaign_title: str | None = None
    campaign_brand_name: str | None = None
