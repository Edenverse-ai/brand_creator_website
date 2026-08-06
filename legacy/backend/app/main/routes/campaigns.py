import logging
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Path, Query

from ..models.campaign import (
    BrandProfileStatus,
    Campaign,
    CampaignCreate,
    CampaignMutationResponse,
    CampaignWithApplications,
)
from ..services.brand_service import BrandService
from ..services.campaign_service import CampaignService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=list[Campaign])
async def get_campaigns(
    search: str | None = Query(None, description="Search term for title or brand"),
    platform: str | None = Query(None, description="Filter by platform"),
    category: str | None = Query(None, description="Filter by category"),
):
    """Get all campaigns with optional filtering."""
    return await CampaignService.get_campaigns(search, platform, category)


@router.get("/{campaign_id}", response_model=Campaign)
async def get_campaign_by_id(campaign_id: str = Path(..., description="The ID of the campaign")):
    """Get a specific campaign by ID for public viewing."""
    return await CampaignService.get_campaign_by_id(campaign_id)


# Fix the brand campaigns routes to have proper paths
@router.get("/brand/{brand_id}", response_model=list[CampaignWithApplications])
async def get_brand_campaigns(
    brand_id: str = Path(..., description="The brand profile ID (not user ID)"),
    status: str | None = Query(None, description="Filter by campaign status"),
    start_date: str | None = Query(None, description="Filter by start date (format: YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter by end date (format: YYYY-MM-DD)"),
    search: str | None = Query(None, description="Search in campaign title or description"),
):
    """Get all campaigns for a specific brand with optional filtering."""
    return await BrandService.get_brand_campaigns(brand_id, status, start_date, end_date, search)


@router.get("/brand/{brand_id}/campaign/{campaign_id}", response_model=CampaignWithApplications)
async def get_brand_campaign(
    brand_id: str = Path(..., description="The brand profile ID or user ID"),
    campaign_id: str = Path(..., description="The ID of the campaign"),
):
    """Get a specific campaign by ID with all its applications."""
    return await BrandService.get_brand_campaign(brand_id, campaign_id)


@router.post("/brand/{brand_id}/add", response_model=CampaignMutationResponse)
async def add_campaign(
    brand_id: str = Path(..., description="The user ID of the brand"),
    campaign: CampaignCreate = Body(..., description="Campaign details to create"),
):
    """Create a new campaign for a specific brand."""
    logger.info(
        f"Received campaign creation request for brand_id: {brand_id}, campaign title: {campaign.title}"
    )

    # Add validation for brand_id
    if not brand_id or brand_id.strip() == "":
        raise HTTPException(status_code=400, detail="Brand ID is required")

    try:
        result = await CampaignService.create_campaign(brand_id, campaign)
        logger.info(f"Campaign creation successful: {result}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in add_campaign endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create campaign")


@router.post("/brand/{brand_id}/ensure-profile", response_model=BrandProfileStatus)
async def ensure_brand_profile(brand_id: str = Path(..., description="The user ID of the brand")):
    """Ensure a brand profile exists for the given user ID."""
    try:
        from ..database.connection import supabase

        if not supabase:
            raise HTTPException(500, "Database not configured")

        # Check if brand profile exists
        brand_profile_response = (
            supabase.table("BrandProfile")
            .select("id, userId, companyName")
            .eq("userId", brand_id)
            .execute()
        )

        if brand_profile_response.data and len(brand_profile_response.data) > 0:
            return {
                "exists": True,
                "brand_profile": brand_profile_response.data[0],
                "message": "Brand profile already exists",
            }

        # Create brand profile if it doesn't exist
        create_response = (
            supabase.table("BrandProfile")
            .insert(
                {
                    "userId": brand_id,
                    "companyName": f"Brand {brand_id[:8]}",
                    "created_at": datetime.now().isoformat(),
                }
            )
            .execute()
        )

        if create_response.data and len(create_response.data) > 0:
            return {
                "exists": False,
                "created": True,
                "brand_profile": create_response.data[0],
                "message": "Brand profile created successfully",
            }
        else:
            raise HTTPException(500, "Failed to create brand profile")

    except Exception as e:
        logger.error(f"Error ensuring brand profile: {str(e)}")
        raise HTTPException(500, f"Failed to ensure brand profile: {str(e)}")


@router.put("/brand/{brand_id}/campaign/{campaign_id}", response_model=CampaignMutationResponse)
async def update_campaign(
    brand_id: str = Path(..., description="The user ID of the brand"),
    campaign_id: str = Path(..., description="The ID of the campaign"),
    campaign_update: CampaignCreate = Body(..., description="Updated campaign details"),
):
    """Update an existing campaign for a specific brand."""
    return await CampaignService.update_campaign(brand_id, campaign_id, campaign_update)


@router.delete("/brand/{brand_id}/campaign/{campaign_id}", response_model=CampaignMutationResponse)
async def delete_campaign(
    brand_id: str = Path(..., description="The user ID of the brand"),
    campaign_id: str = Path(..., description="The ID of the campaign"),
):
    """Delete a campaign for a specific brand."""
    return await CampaignService.delete_campaign(brand_id, campaign_id)
