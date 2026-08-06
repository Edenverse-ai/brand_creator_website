import json
import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from ..database.connection import supabase
from ..models.campaign import Campaign, CampaignCreate
from ..utils.validators import check_table_exists, validate_uuid

logger = logging.getLogger(__name__)


class CampaignService:
    @staticmethod
    async def get_campaigns(
        search: str | None = None, platform: str | None = None, category: str | None = None
    ) -> list[Campaign]:
        """Get all campaigns with optional filtering."""
        logger.info(
            f"Getting campaigns with params: search={search}, platform={platform}, category={category}"
        )

        if not supabase:
            logger.warning("Supabase client not available, returning empty list")
            return []

        try:
            table_exists = await check_table_exists(supabase, "campaigns")
            if not table_exists:
                logger.warning(
                    "Campaigns table does not exist or is inaccessible, returning empty list"
                )
                return []

            query = supabase.table("campaigns").select("*")

            if platform and platform != "all":
                query = query.eq("platform", platform.lower())

            try:
                response = query.execute()
                campaigns = response.data or []
                logger.info(f"Retrieved {len(campaigns)} campaigns from Supabase")
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Database query error: {error_msg}")

                if "permission denied" in error_msg.lower():
                    logger.error(
                        "Permission denied error. Check your Supabase RLS policies and service key permissions."
                    )
                    return []
                raise HTTPException(status_code=500, detail=f"Database query error: {error_msg}")

            if search and campaigns:
                search_lower = search.lower()
                filtered_campaigns = []
                for c in campaigns:
                    title = c.get("title", "").lower()
                    brand_id = str(c.get("brand_id", "")).lower()
                    if search_lower in title or search_lower in brand_id:
                        filtered_campaigns.append(c)
                campaigns = filtered_campaigns
                logger.info(f"Filtered to {len(campaigns)} campaigns after search")

            for campaign in campaigns:
                if campaign.get("brand_id"):
                    try:
                        brand_response = (
                            supabase.table("BrandProfile")
                            .select("companyName")
                            .eq("id", campaign["brand_id"])
                            .execute()
                        )
                        if brand_response.data and len(brand_response.data) > 0:
                            campaign["brand_name"] = brand_response.data[0].get(
                                "companyName", "Unknown Brand"
                            )
                        else:
                            campaign["brand_name"] = "Unknown Brand"
                    except Exception as e:
                        logger.error(f"Error fetching brand details: {str(e)}")
                        campaign["brand_name"] = f"Brand {campaign['brand_id']}"
                else:
                    campaign["brand_name"] = "Unknown Brand"

            return campaigns

        except Exception as e:
            logger.error(f"Error processing request: {str(e)}")
            return []

    @staticmethod
    async def get_campaign_by_id(campaign_id: str) -> dict[str, Any]:
        """Get a specific campaign by ID for public viewing."""
        logger.info(f"Fetching public campaign details for ID: {campaign_id}")

        if not supabase:
            return {"error": "Supabase connection not available"}

        if not validate_uuid(campaign_id):
            logger.error(f"Invalid UUID format for campaign_id: {campaign_id}")
            raise HTTPException(status_code=400, detail="Invalid campaign ID format")

        try:
            campaign_response = (
                supabase.table("campaigns")
                .select("*")
                .eq("id", campaign_id)
                .eq("is_open", True)
                .execute()
            )
        except Exception as db_error:
            logger.error(f"Database error fetching campaign: {str(db_error)}")
            if "invalid input syntax for type uuid" in str(db_error).lower():
                raise HTTPException(status_code=400, detail="Invalid campaign ID format")
            raise HTTPException(status_code=500, detail="Database error fetching campaign")

        if not campaign_response.data or len(campaign_response.data) == 0:
            logger.warning(f"Campaign {campaign_id} not found or not open")
            raise HTTPException(status_code=404, detail="Campaign not found")

        campaign = campaign_response.data[0]

        try:
            brand_response = (
                supabase.table("BrandProfile")
                .select("companyName")
                .eq("id", campaign["brand_id"])
                .execute()
            )

            if brand_response.data and len(brand_response.data) > 0:
                campaign["brand_name"] = brand_response.data[0].get("companyName", "Unknown Brand")
            else:
                campaign["brand_name"] = "Unknown Brand"
        except Exception as e:
            logger.error(f"Error fetching brand information: {str(e)}")
            campaign["brand_name"] = "Unknown Brand"

        return campaign

    @staticmethod
    async def create_campaign(brand_id: str, campaign: CampaignCreate) -> dict[str, Any]:
        """Create a new campaign for a specific brand."""
        logger.info(f"Creating campaign for user ID {brand_id}: {campaign.title}")

        if not supabase:
            logger.warning("Supabase not configured, cannot create campaign")
            raise HTTPException(500, "Database not configured")

        # Enhanced brand profile lookup with better error handling
        logger.info(f"Looking up brand profile for user ID: {brand_id}")

        try:
            brand_profile_response = (
                supabase.table("BrandProfile")
                .select("id, userId, companyName")
                .eq("userId", brand_id)
                .execute()
            )

            logger.info(f"Brand profile query response: {brand_profile_response}")

            if not brand_profile_response.data or len(brand_profile_response.data) == 0:
                # Try to find if there are any brand profiles for debugging
                logger.warning(f"No brand profile found for user ID: {brand_id}")

                # Check if there are any brand profiles at all
                try:
                    all_brands_response = (
                        supabase.table("BrandProfile")
                        .select("id, userId, companyName")
                        .limit(5)
                        .execute()
                    )
                    logger.info(f"Sample brand profiles in database: {all_brands_response.data}")
                except Exception as debug_error:
                    logger.error(f"Error fetching sample brand profiles: {str(debug_error)}")

                # Check if the brand_id might actually be a brand profile ID instead of user ID
                try:
                    direct_brand_response = (
                        supabase.table("BrandProfile")
                        .select("id, userId, companyName")
                        .eq("id", brand_id)
                        .execute()
                    )

                    if direct_brand_response.data and len(direct_brand_response.data) > 0:
                        logger.info(
                            f"Found brand profile by ID instead of userId: {direct_brand_response.data[0]}"
                        )
                        actual_brand_id = brand_id  # Use the ID directly
                        direct_brand_response.data[0]
                    else:
                        # Create a brand profile automatically if none exists
                        logger.info(f"Creating brand profile for user ID: {brand_id}")
                        create_response = (
                            supabase.table("BrandProfile")
                            .insert(
                                {
                                    "userId": brand_id,
                                    "companyName": f"Brand {brand_id[:8]}",  # Default company name
                                    "created_at": datetime.now().isoformat(),
                                }
                            )
                            .execute()
                        )

                        if create_response.data and len(create_response.data) > 0:
                            actual_brand_id = create_response.data[0]["id"]
                            logger.info(f"Created brand profile with ID: {actual_brand_id}")
                        else:
                            raise HTTPException(
                                status_code=500, detail="Failed to create brand profile"
                            )

                except Exception as fallback_error:
                    logger.error(f"Error in brand profile fallback: {str(fallback_error)}")
                    raise HTTPException(
                        status_code=404,
                        detail=f"Brand profile not found for user ID: {brand_id}. Please create a brand profile first.",
                    )
            else:
                actual_brand_id = brand_profile_response.data[0]["id"]
                brand_profile_response.data[0]
                logger.info(f"Found brand profile ID: {actual_brand_id} for user ID: {brand_id}")

        except Exception as lookup_error:
            logger.error(f"Error looking up brand profile: {str(lookup_error)}")
            raise HTTPException(
                status_code=500,
                detail=f"Database error looking up brand profile: {str(lookup_error)}",
            )

        campaign_data = campaign.dict()
        campaign_data["brand_id"] = actual_brand_id
        campaign_data["created_at"] = datetime.now().isoformat()

        array_fields = [
            "primary_promotion_objectives",
            "creator_profile_preferences_gender",
            "creator_profile_preference_ethnicity",
            "creator_profile_preference_content_niche",
            "preferred_creator_location",
            "creator_tier_requirement",
        ]

        for field in array_fields:
            if field in campaign_data and isinstance(campaign_data[field], list):
                campaign_data[field] = json.dumps(campaign_data[field])

        campaign_data = {k: v for k, v in campaign_data.items() if v is not None and v != ""}

        try:
            response = supabase.table("campaigns").insert(campaign_data).execute()
            logger.info(f"Campaign created successfully: {response}")

            if response.data:
                campaign_id = response.data[0]["id"]
                return {
                    "success": True,
                    "campaign_id": campaign_id,
                    "message": "Campaign created successfully",
                }
            else:
                raise HTTPException(500, "Failed to create campaign - no data returned")

        except Exception as db_error:
            logger.error(f"Database error creating campaign: {str(db_error)}")
            raise HTTPException(500, f"Database error: {str(db_error)}")

    @staticmethod
    async def update_campaign(
        brand_id: str, campaign_id: str, campaign_update: CampaignCreate
    ) -> dict[str, Any]:
        """Update an existing campaign for a specific brand."""
        logger.info(f"Updating campaign {campaign_id} for user ID {brand_id}")

        if not supabase:
            logger.warning("Supabase not configured, cannot update campaign")
            raise HTTPException(500, "Database not configured")

        brand_profile_response = (
            supabase.table("BrandProfile").select("id").eq("userId", brand_id).execute()
        )

        if not brand_profile_response.data or len(brand_profile_response.data) == 0:
            logger.warning(f"Brand profile not found for user ID: {brand_id}")
            raise HTTPException(status_code=404, detail="Brand profile not found")

        actual_brand_id = brand_profile_response.data[0]["id"]

        existing_campaign = (
            supabase.table("campaigns")
            .select("*")
            .eq("id", campaign_id)
            .eq("brand_id", actual_brand_id)
            .execute()
        )

        if not existing_campaign.data or len(existing_campaign.data) == 0:
            raise HTTPException(404, "Campaign not found or access denied")

        campaign_data = campaign_update.dict()

        array_fields = [
            "primary_promotion_objectives",
            "creator_profile_preferences_gender",
            "creator_profile_preference_ethnicity",
            "creator_profile_preference_content_niche",
            "preferred_creator_location",
            "creator_tier_requirement",
        ]

        for field in array_fields:
            if field in campaign_data and isinstance(campaign_data[field], list):
                campaign_data[field] = json.dumps(campaign_data[field])

        campaign_data = {
            k: v for k, v in campaign_data.items() if v is not None and v != "" and k != "brand_id"
        }

        try:
            response = (
                supabase.table("campaigns")
                .update(campaign_data)
                .eq("id", campaign_id)
                .eq("brand_id", actual_brand_id)
                .execute()
            )

            if response.data:
                return {
                    "success": True,
                    "campaign_id": campaign_id,
                    "message": "Campaign updated successfully",
                }
            else:
                raise HTTPException(500, "Failed to update campaign - no data returned")

        except Exception as db_error:
            logger.error(f"Database error updating campaign: {str(db_error)}")
            raise HTTPException(500, f"Database error: {str(db_error)}")

    @staticmethod
    async def delete_campaign(brand_id: str, campaign_id: str) -> dict[str, Any]:
        """Delete a campaign for a specific brand."""
        logger.info(f"Deleting campaign {campaign_id} for user ID {brand_id}")

        if not supabase:
            logger.warning("Supabase not configured, cannot delete campaign")
            raise HTTPException(500, "Database not configured")

        brand_profile_response = (
            supabase.table("BrandProfile").select("id").eq("userId", brand_id).execute()
        )

        if not brand_profile_response.data or len(brand_profile_response.data) == 0:
            logger.warning(f"Brand profile not found for user ID: {brand_id}")
            raise HTTPException(status_code=404, detail="Brand profile not found")

        actual_brand_id = brand_profile_response.data[0]["id"]

        existing_campaign = (
            supabase.table("campaigns")
            .select("id")
            .eq("id", campaign_id)
            .eq("brand_id", actual_brand_id)
            .execute()
        )

        if not existing_campaign.data or len(existing_campaign.data) == 0:
            raise HTTPException(404, "Campaign not found or access denied")

        try:
            supabase.table("campaignclaims").delete().eq("campaign_id", campaign_id).execute()
        except Exception as e:
            logger.warning(f"Error deleting campaign claims: {str(e)}")

        (
            supabase.table("campaigns")
            .delete()
            .eq("id", campaign_id)
            .eq("brand_id", actual_brand_id)
            .execute()
        )

        return {
            "success": True,
            "campaign_id": campaign_id,
            "message": "Campaign deleted successfully",
        }
