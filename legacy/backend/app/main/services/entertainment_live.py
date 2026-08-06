import json
import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from ..database.connection import supabase
from ..models.entertainment_live import EntertainmentLiveCreate
from ..utils.validators import check_table_exists, validate_uuid

logger = logging.getLogger(__name__)


class EntertainmentLiveService:
    @staticmethod
    async def get_entertainment_live_missions(
        search: str | None = None,
        platform: str | None = None,
        region: str | None = None,
        reward_model: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get all entertainment live missions with optional filtering."""
        logger.info(
            f"Getting entertainment live missions with params: search={search}, platform={platform}, region={region}, reward_model={reward_model}"
        )

        if not supabase:
            logger.warning("Supabase client not available, returning empty list")
            return []

        try:
            table_exists = await check_table_exists(supabase, "entertainment_live")
            if not table_exists:
                logger.warning(
                    "Entertainment_live table does not exist or is inaccessible, returning empty list"
                )
                return []

            # Start with base query
            query = supabase.table("entertainment_live").select("*")

            # Apply database-level filters
            if platform and platform != "all":
                query = query.eq("platform", platform.lower())

            if region and region != "all":
                query = query.eq("region_priority", region)

            if reward_model and reward_model != "all":
                query = query.eq("reward_model", reward_model)

            # Database-level search using Supabase's text search
            if search and search.strip():
                # Use Supabase's text search operators for better performance
                search_term = f"%{search}%"
                query = query.or_(
                    f"task_title.ilike.{search_term},campaign_objective.ilike.{search_term}"
                )

            # Apply ordering and limit
            query = query.limit(limit).order("created_at", desc=True)

            # Execute the optimized query
            response = query.execute()
            missions = response.data or []
            logger.info(f"Retrieved {len(missions)} entertainment live missions from Supabase")

            # Enrich with brand information (keep this as it requires a separate table)
            for mission in missions:
                if mission.get("brand_id"):
                    try:
                        brand_response = (
                            supabase.table("BrandProfile")
                            .select("companyName")
                            .eq("id", mission["brand_id"])
                            .execute()
                        )

                        if brand_response.data and len(brand_response.data) > 0:
                            mission["brand_name"] = brand_response.data[0].get(
                                "companyName", "Unknown Brand"
                            )
                        else:
                            mission["brand_name"] = "Unknown Brand"
                    except Exception as e:
                        logger.error(f"Error fetching brand details: {str(e)}")
                        mission["brand_name"] = f"Brand {mission['brand_id']}"
                else:
                    mission["brand_name"] = "Unknown Brand"

                # Parse JSON fields safely
                if mission.get("niche_tags"):
                    try:
                        if isinstance(mission["niche_tags"], str):
                            mission["niche_tags"] = json.loads(mission["niche_tags"])
                    except (json.JSONDecodeError, TypeError):
                        # If parsing fails, treat as comma-separated string
                        if isinstance(mission["niche_tags"], str):
                            mission["niche_tags"] = [
                                tag.strip()
                                for tag in mission["niche_tags"].split(",")
                                if tag.strip()
                            ]

            return missions

        except Exception as e:
            logger.error(f"Error processing request: {str(e)}")
            if "permission denied" in str(e).lower():
                logger.error(
                    "Permission denied error. Check your Supabase RLS policies and service key permissions."
                )
                return []
            raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")

    @staticmethod
    async def get_entertainment_live_mission_by_id(mission_id: str) -> dict[str, Any]:
        """Get a specific entertainment live mission by ID."""
        logger.info(f"Fetching entertainment live mission details for ID: {mission_id}")

        if not supabase:
            return {"error": "Supabase connection not available"}

        if not validate_uuid(mission_id):
            logger.error(f"Invalid UUID format for mission_id: {mission_id}")
            raise HTTPException(status_code=400, detail="Invalid mission ID format")

        try:
            mission_response = (
                supabase.table("entertainment_live").select("*").eq("id", mission_id).execute()
            )
        except Exception as db_error:
            logger.error(f"Database error fetching mission: {str(db_error)}")
            if "invalid input syntax for type uuid" in str(db_error).lower():
                raise HTTPException(status_code=400, detail="Invalid mission ID format")
            raise HTTPException(status_code=500, detail="Database error fetching mission")

        if not mission_response.data or len(mission_response.data) == 0:
            logger.warning(f"Entertainment live mission {mission_id} not found")
            raise HTTPException(status_code=404, detail="Mission not found")

        mission = mission_response.data[0]

        # Get brand information
        try:
            brand_response = (
                supabase.table("BrandProfile")
                .select("companyName")
                .eq("id", mission["brand_id"])
                .execute()
            )

            if brand_response.data and len(brand_response.data) > 0:
                mission["brand_name"] = brand_response.data[0].get("companyName", "Unknown Brand")
            else:
                mission["brand_name"] = "Unknown Brand"
        except Exception as e:
            logger.error(f"Error fetching brand information: {str(e)}")
            mission["brand_name"] = "Unknown Brand"

        # Parse JSON fields safely
        if mission.get("niche_tags"):
            try:
                if isinstance(mission["niche_tags"], str):
                    mission["niche_tags"] = json.loads(mission["niche_tags"])
            except (json.JSONDecodeError, TypeError):
                if isinstance(mission["niche_tags"], str):
                    mission["niche_tags"] = [
                        tag.strip() for tag in mission["niche_tags"].split(",") if tag.strip()
                    ]

        return mission

    @staticmethod
    async def create_entertainment_live_mission(
        brand_id: str, mission: EntertainmentLiveCreate
    ) -> dict[str, Any]:
        """Create a new entertainment live mission for a specific brand."""
        logger.info(
            f"Creating entertainment live mission for brand ID {brand_id}: {mission.task_title}"
        )

        if not supabase:
            logger.warning("Supabase not configured, cannot create mission")
            raise HTTPException(500, "Database not configured")

        # Verify brand profile exists
        logger.info(f"Looking up brand profile for brand ID: {brand_id}")

        try:
            brand_profile_response = (
                supabase.table("BrandProfile")
                .select("id, userId, companyName")
                .eq("id", brand_id)
                .execute()
            )

            if not brand_profile_response.data or len(brand_profile_response.data) == 0:
                # Try with userId
                brand_profile_response = (
                    supabase.table("BrandProfile")
                    .select("id, userId, companyName")
                    .eq("userId", brand_id)
                    .execute()
                )

                if not brand_profile_response.data or len(brand_profile_response.data) == 0:
                    logger.warning(f"Brand profile not found for ID: {brand_id}")
                    raise HTTPException(
                        status_code=404, detail=f"Brand profile not found for ID: {brand_id}"
                    )

                actual_brand_id = brand_profile_response.data[0]["id"]
            else:
                actual_brand_id = brand_id

            logger.info(f"Found brand profile ID: {actual_brand_id}")

        except Exception as lookup_error:
            logger.error(f"Error looking up brand profile: {str(lookup_error)}")
            raise HTTPException(
                status_code=500,
                detail=f"Database error looking up brand profile: {str(lookup_error)}",
            )

        mission_data = mission.dict()
        mission_data["brand_id"] = actual_brand_id
        mission_data["created_at"] = datetime.now().isoformat()
        mission_data["updated_at"] = datetime.now().isoformat()

        # Handle array fields
        if mission_data.get("niche_tags") and isinstance(mission_data["niche_tags"], list):
            mission_data["niche_tags"] = json.dumps(mission_data["niche_tags"])

        # Remove None values
        mission_data = {k: v for k, v in mission_data.items() if v is not None and v != ""}

        try:
            response = supabase.table("entertainment_live").insert(mission_data).execute()
            logger.info(f"Entertainment live mission created successfully: {response}")

            if response.data:
                mission_id = response.data[0]["id"]
                return {
                    "success": True,
                    "mission_id": mission_id,
                    "message": "Entertainment live mission created successfully",
                }
            else:
                raise HTTPException(500, "Failed to create mission - no data returned")

        except Exception as db_error:
            logger.error(f"Database error creating mission: {str(db_error)}")
            raise HTTPException(500, f"Database error: {str(db_error)}")

    @staticmethod
    async def update_entertainment_live_mission(
        brand_id: str, mission_id: str, mission_update: EntertainmentLiveCreate
    ) -> dict[str, Any]:
        """Update an existing entertainment live mission for a specific brand."""
        logger.info(f"Updating entertainment live mission {mission_id} for brand ID {brand_id}")

        if not supabase:
            logger.warning("Supabase not configured, cannot update mission")
            raise HTTPException(500, "Database not configured")

        # Verify brand profile and mission ownership
        brand_profile_response = (
            supabase.table("BrandProfile").select("id").eq("userId", brand_id).execute()
        )

        if not brand_profile_response.data or len(brand_profile_response.data) == 0:
            logger.warning(f"Brand profile not found for user ID: {brand_id}")
            raise HTTPException(status_code=404, detail="Brand profile not found")

        actual_brand_id = brand_profile_response.data[0]["id"]

        existing_mission = (
            supabase.table("entertainment_live")
            .select("*")
            .eq("id", mission_id)
            .eq("brand_id", actual_brand_id)
            .execute()
        )

        if not existing_mission.data or len(existing_mission.data) == 0:
            raise HTTPException(404, "Mission not found or access denied")

        mission_data = mission_update.dict()
        mission_data["updated_at"] = datetime.now().isoformat()

        # Handle array fields
        if mission_data.get("niche_tags") and isinstance(mission_data["niche_tags"], list):
            mission_data["niche_tags"] = json.dumps(mission_data["niche_tags"])

        # Remove None values and brand_id
        mission_data = {
            k: v for k, v in mission_data.items() if v is not None and v != "" and k != "brand_id"
        }

        try:
            response = (
                supabase.table("entertainment_live")
                .update(mission_data)
                .eq("id", mission_id)
                .eq("brand_id", actual_brand_id)
                .execute()
            )

            if response.data:
                return {
                    "success": True,
                    "mission_id": mission_id,
                    "message": "Entertainment live mission updated successfully",
                }
            else:
                raise HTTPException(500, "Failed to update mission - no data returned")

        except Exception as db_error:
            logger.error(f"Database error updating mission: {str(db_error)}")
            raise HTTPException(500, f"Database error: {str(db_error)}")

    @staticmethod
    async def delete_entertainment_live_mission(brand_id: str, mission_id: str) -> dict[str, Any]:
        """Delete an entertainment live mission for a specific brand."""
        logger.info(f"Deleting entertainment live mission {mission_id} for brand ID {brand_id}")

        if not supabase:
            logger.warning("Supabase not configured, cannot delete mission")
            raise HTTPException(500, "Database not configured")

        brand_profile_response = (
            supabase.table("BrandProfile").select("id").eq("userId", brand_id).execute()
        )

        if not brand_profile_response.data or len(brand_profile_response.data) == 0:
            logger.warning(f"Brand profile not found for user ID: {brand_id}")
            raise HTTPException(status_code=404, detail="Brand profile not found")

        actual_brand_id = brand_profile_response.data[0]["id"]

        existing_mission = (
            supabase.table("entertainment_live")
            .select("id, task_title")
            .eq("id", mission_id)
            .eq("brand_id", actual_brand_id)
            .execute()
        )

        if not existing_mission.data or len(existing_mission.data) == 0:
            raise HTTPException(404, "Mission not found or access denied")

        (
            supabase.table("entertainment_live")
            .delete()
            .eq("id", mission_id)
            .eq("brand_id", actual_brand_id)
            .execute()
        )

        return {
            "success": True,
            "mission_id": mission_id,
            "message": "Entertainment live mission deleted successfully",
        }
