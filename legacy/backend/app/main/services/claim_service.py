import logging
from typing import Any

from fastapi import HTTPException

from ..database.connection import supabase
from ..models.claim import CampaignClaimCreate
from ..utils.validators import validate_uuid

logger = logging.getLogger(__name__)


class ClaimService:
    @staticmethod
    async def check_campaign_claim(creator_id: str, campaign_id: str) -> dict[str, bool]:
        """Check if a creator has already applied to a campaign."""
        try:
            if not supabase:
                return {"exists": False}

            logger.info(f"Looking up creator profile for userId: {creator_id}")

            creator_profile = (
                supabase.table("CreatorProfile").select("id").eq("userId", creator_id).execute()
            )

            if not creator_profile.data or len(creator_profile.data) == 0:
                logger.warning(f"Creator profile not found for userId {creator_id}")
                return {"exists": False}

            creator_id = creator_profile.data[0]["id"]
            logger.info(f"Found creator ID: {creator_id} for userId: {creator_id}")

            try:
                response = (
                    supabase.table("campaignclaims")
                    .select("id")
                    .eq("campaign_id", campaign_id)
                    .eq("creator_id", creator_id)
                    .execute()
                )
            except Exception as db_error:
                logger.error(f"Database error checking claim: {str(db_error)}")
                if "invalid input syntax for type uuid" in str(db_error).lower():
                    logger.warning(f"Invalid UUID format for campaign_id: {campaign_id}")
                    return {"exists": False}
                raise

            claim_exists = len(response.data) > 0
            logger.info(
                f"Checking if claim exists for creator {creator_id} and campaign {campaign_id}: {claim_exists}"
            )
            return {"exists": claim_exists}

        except Exception as e:
            logger.error(f"Error checking campaign claim: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to check campaign claim: {str(e)}")

    @staticmethod
    async def create_campaign_claim(campaign_claim: CampaignClaimCreate) -> dict[str, Any]:
        """Create a new campaign claim (application) from a creator."""
        try:
            logger.info(
                f"Creating campaign claim for user {campaign_claim.user_id} and campaign {campaign_claim.campaign_id}"
            )

            if not supabase:
                logger.error("Supabase not available, cannot create campaign claim")
                raise HTTPException(status_code=500, detail="Database not available")

            if not validate_uuid(campaign_claim.campaign_id):
                logger.error(f"Invalid UUID format for campaign_id: {campaign_claim.campaign_id}")
                raise HTTPException(status_code=400, detail="Invalid campaign ID format")

            creator_profile = (
                supabase.table("CreatorProfile")
                .select("id")
                .eq("userId", campaign_claim.user_id)
                .execute()
            )

            if not creator_profile.data or len(creator_profile.data) == 0:
                logger.error(
                    f"Creator with userId {campaign_claim.user_id} not found in CreatorProfile table"
                )
                raise HTTPException(status_code=404, detail="Creator not found")

            creator_id = creator_profile.data[0]["id"]
            logger.info(f"Found creator ID: {creator_id} for user ID: {campaign_claim.user_id}")

            try:
                existing_claim = (
                    supabase.table("campaignclaims")
                    .select("id")
                    .eq("campaign_id", campaign_claim.campaign_id)
                    .eq("creator_id", creator_id)
                    .execute()
                )
            except Exception as db_error:
                logger.error(f"Database error checking existing claim: {str(db_error)}")
                if "invalid input syntax for type uuid" in str(db_error).lower():
                    raise HTTPException(status_code=400, detail="Invalid campaign ID format")
                raise HTTPException(
                    status_code=500, detail="Database error checking existing claim"
                )

            if existing_claim.data and len(existing_claim.data) > 0:
                logger.info(
                    f"Creator {creator_id} has already applied to campaign {campaign_claim.campaign_id}"
                )
                return {"status": "already_applied", "claim_id": existing_claim.data[0]["id"]}

            try:
                campaign = (
                    supabase.table("campaigns")
                    .select("id")
                    .eq("id", campaign_claim.campaign_id)
                    .execute()
                )
            except Exception as db_error:
                logger.error(f"Database error validating campaign: {str(db_error)}")
                if "invalid input syntax for type uuid" in str(db_error).lower():
                    raise HTTPException(status_code=400, detail="Invalid campaign ID format")
                raise HTTPException(status_code=500, detail="Database error validating campaign")

            if not campaign.data or len(campaign.data) == 0:
                logger.error(f"Campaign {campaign_claim.campaign_id} not found")
                raise HTTPException(status_code=404, detail="Campaign not found")

            try:
                response = (
                    supabase.table("campaignclaims")
                    .insert(
                        {
                            "campaign_id": campaign_claim.campaign_id,
                            "creator_id": creator_id,
                            "status": "pending",
                            "sample_text": campaign_claim.sample_text,
                            "sample_video_url": campaign_claim.sample_video_url,
                        }
                    )
                    .execute()
                )
            except Exception as db_error:
                logger.error(f"Database error creating claim: {str(db_error)}")
                if "invalid input syntax for type uuid" in str(db_error).lower():
                    raise HTTPException(status_code=400, detail="Invalid campaign ID format")
                raise HTTPException(status_code=500, detail="Database error creating claim")

            if not response.data or len(response.data) == 0:
                logger.error("Failed to create campaign claim, no data returned from database")
                raise HTTPException(status_code=500, detail="Failed to create campaign claim")

            logger.info(f"Successfully created campaign claim with ID {response.data[0]['id']}")
            return {"status": "success", "claim_id": response.data[0]["id"]}

        except HTTPException as he:
            raise he
        except Exception as e:
            logger.error(f"Error creating campaign claim: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to create campaign claim: {str(e)}"
            )

    @staticmethod
    async def get_creator_campaign_claims(creator_id: str, limit: int = 10) -> list[dict[str, Any]]:
        """Get campaign claims for a specific creator using database function."""
        try:
            logger.info(f"Fetching campaign claims for creator with userId: {creator_id}")

            if not supabase:
                logger.warning("Supabase not available, returning empty list")
                return []

            # First look up the creator's actual ID from CreatorProfile using userId
            creator_profile = (
                supabase.table("CreatorProfile").select("id").eq("userId", creator_id).execute()
            )

            if not creator_profile.data or len(creator_profile.data) == 0:
                logger.warning(f"Creator with userId {creator_id} not found")
                return []

            # Get the actual creator ID to use in queries
            actual_creator_id = creator_profile.data[0]["id"]
            logger.info(f"Found actual creator ID: {actual_creator_id} for userId: {creator_id}")

            # Use direct query with UUID campaign_id handling
            try:
                logger.info(f"Using direct query for creator claims with ID: {actual_creator_id}")
                claims_response = (
                    supabase.table("campaignclaims")
                    .select("*")
                    .eq("creator_id", actual_creator_id)
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )

                if not claims_response.data:
                    logger.info(f"No campaign claims found for creator {creator_id}")
                    return []

                # Process and format the results with campaign details including new fields
                result = []
                for claim in claims_response.data:
                    # Query campaigns table using UUID campaign_id
                    try:
                        campaign_response = (
                            supabase.table("campaigns")
                            .select("*")
                            .eq("id", claim.get("campaign_id"))
                            .execute()
                        )
                    except Exception as db_error:
                        logger.error(
                            f"Error fetching campaign for claim {claim.get('id')}: {str(db_error)}"
                        )
                        campaign_response = None

                    campaign_data = {}
                    if (
                        campaign_response
                        and campaign_response.data
                        and len(campaign_response.data) > 0
                    ):
                        campaign_data = campaign_response.data[0]

                    # Create result item with all relevant fields including the new ones
                    result_item = {
                        "id": claim.get("id"),
                        "campaign_id": str(
                            claim.get("campaign_id")
                        ),  # Convert UUID to string for JSON
                        "creator_id": claim.get("creator_id"),
                        "status": claim.get("status"),
                        "sample_text": claim.get("sample_text"),
                        "sample_video_url": claim.get("sample_video_url"),
                        "created_at": claim.get("created_at"),
                        # Basic campaign fields
                        "campaign_title": campaign_data.get("title", "Unknown Campaign"),
                        "campaign_brand_name": "Unknown Brand",  # Will be updated below
                        "campaign_deadline": campaign_data.get("deadline"),
                        "campaign_budget_range": campaign_data.get("budget_range"),
                        "campaign_budget_unit": campaign_data.get("budget_unit", "total"),
                        "campaign_brief": campaign_data.get("brief"),
                        "campaign_sample_video_url": campaign_data.get("sample_video_url"),
                        # Existing campaign fields
                        "industry_category": campaign_data.get("industry_category"),
                        "primary_promotion_objectives": campaign_data.get(
                            "primary_promotion_objectives"
                        ),
                        "ad_placement": campaign_data.get("ad_placement"),
                        "campaign_execution_mode": campaign_data.get("campaign_execution_mode"),
                        "creator_profile_preferences_gender": campaign_data.get(
                            "creator_profile_preferences_gender"
                        ),
                        "creator_profile_preference_ethnicity": campaign_data.get(
                            "creator_profile_preference_ethnicity"
                        ),
                        "creator_profile_preference_content_niche": campaign_data.get(
                            "creator_profile_preference_content_niche"
                        ),
                        "preferred_creator_location": campaign_data.get(
                            "preferred_creator_location"
                        ),
                        "language_requirement_for_creators": campaign_data.get(
                            "language_requirement_for_creators"
                        ),
                        "creator_tier_requirement": campaign_data.get("creator_tier_requirement"),
                        "send_to_creator": campaign_data.get("send_to_creator"),
                        "approved_by_brand": campaign_data.get("approved_by_brand"),
                        "kpi_reference_target": campaign_data.get("kpi_reference_target"),
                        "prohibited_content_warnings": campaign_data.get(
                            "prohibited_content_warnings"
                        ),
                        "posting_requirements": campaign_data.get("posting_requirements"),
                        "product_photo": campaign_data.get("product_photo"),
                        # New frontend fields
                        "script_required": campaign_data.get("script_required"),
                        "product_name": campaign_data.get("product_name"),
                        "product_highlight": campaign_data.get("product_highlight"),
                        "product_price": campaign_data.get("product_price"),
                        "product_sold_number": campaign_data.get("product_sold_number"),
                        "paid_promotion_type": campaign_data.get("paid_promotion_type"),
                        "video_buyout_budget_range": campaign_data.get("video_buyout_budget_range"),
                        "base_fee_budget_range": campaign_data.get("base_fee_budget_range"),
                    }

                    result.append(result_item)

                    # Try to get the brand name if brand_id exists
                    if campaign_data.get("brand_id"):
                        try:
                            brand_response = (
                                supabase.table("BrandProfile")
                                .select("companyName")
                                .eq("id", campaign_data["brand_id"])
                                .execute()
                            )
                            if brand_response.data and len(brand_response.data) > 0:
                                result_item["campaign_brand_name"] = brand_response.data[0].get(
                                    "companyName", "Unknown Brand"
                                )
                            else:
                                result_item["campaign_brand_name"] = (
                                    f"Brand {campaign_data['brand_id']}"
                                )
                        except Exception as brand_error:
                            logger.error(f"Error fetching brand name: {str(brand_error)}")
                            result_item["campaign_brand_name"] = (
                                f"Brand {campaign_data['brand_id']}"
                            )

                logger.info(f"Retrieved {len(result)} campaign claims for creator {creator_id}")
                return result

            except Exception as db_error:
                logger.error(f"Error fetching claims manually: {str(db_error)}")
                return []

        except Exception as e:
            logger.error(f"Error fetching creator campaign claims: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to fetch campaign claims: {str(e)}"
            )

    @staticmethod
    async def update_claim_status(
        claim_id: str, status: str, brand_id: str | None = None
    ) -> dict[str, Any]:
        """Update the status of a campaign claim."""
        try:
            logger.info(f"Updating claim {claim_id} status to {status}")

            if not supabase:
                logger.error("Supabase not available, cannot update claim status")
                raise HTTPException(status_code=500, detail="Database not available")

            # Validate status
            valid_statuses = ["pending", "approved", "rejected", "under_review", "completed"]
            if status not in valid_statuses:
                raise HTTPException(
                    status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}"
                )

            # Validate claim_id format if it should be UUID
            if not validate_uuid(claim_id):
                logger.error(f"Invalid UUID format for claim_id: {claim_id}")
                raise HTTPException(status_code=400, detail="Invalid claim ID format")

            # Check if claim exists and optionally verify brand ownership
            existing_claim_query = (
                supabase.table("campaignclaims")
                .select("id, status, campaign_id, creator_id")
                .eq("id", claim_id)
            )

            existing_claim = existing_claim_query.execute()

            if not existing_claim.data or len(existing_claim.data) == 0:
                logger.warning(f"Campaign claim {claim_id} not found")
                raise HTTPException(status_code=404, detail="Campaign claim not found")

            claim_data = existing_claim.data[0]

            # If brand_id is provided, verify the brand owns the campaign
            if brand_id:
                try:
                    campaign_response = (
                        supabase.table("campaigns")
                        .select("brand_id")
                        .eq("id", claim_data["campaign_id"])
                        .execute()
                    )

                    if campaign_response.data and len(campaign_response.data) > 0:
                        campaign_brand_id = campaign_response.data[0]["brand_id"]
                        if campaign_brand_id != brand_id:
                            logger.warning(
                                f"Brand {brand_id} attempted to update claim for campaign owned by {campaign_brand_id}"
                            )
                            raise HTTPException(
                                status_code=403, detail="Unauthorized to update this claim"
                            )
                except Exception as auth_error:
                    logger.error(f"Error verifying brand authorization: {str(auth_error)}")
                    # Continue without strict verification if there's an error

            # Update the status
            response = (
                supabase.table("campaignclaims")
                .update({"status": status})
                .eq("id", claim_id)
                .execute()
            )

            if response.data and len(response.data) > 0:
                logger.info(f"Successfully updated claim {claim_id} status to {status}")
                return {
                    "success": True,
                    "claim_id": claim_id,
                    "status": status,
                    "message": f"Claim status updated to {status}",
                }
            else:
                raise HTTPException(status_code=500, detail="Failed to update claim status")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating claim status: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to update claim status: {str(e)}")
