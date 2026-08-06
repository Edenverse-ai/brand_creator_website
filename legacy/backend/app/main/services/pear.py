import logging
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)


class PearService:
    @staticmethod
    async def get_all_stores(search: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """Get all pear brand stores with optional search filtering."""
        try:
            logger.info(f"Starting get_all_stores with search='{search}', limit={limit}")

            # Import here to avoid circular imports
            from ..database.supabase_client import get_supabase_client

            supabase = get_supabase_client()
            logger.info("Successfully got Supabase client")

            # Build query
            query = supabase.table("pear_brand").select("*")

            # Add search filter if provided
            if search:
                query = query.or_(f"store_name.ilike.%{search}%,store_intro.ilike.%{search}%")
                logger.info(f"Added search filter for: {search}")

            # Add limit and order
            query = query.order("created_at", desc=True).limit(limit)

            # Execute query
            logger.info("Executing Supabase query...")
            response = query.execute()
            logger.info(f"Supabase response: {response}")

            if response.data:
                logger.info(f"Retrieved {len(response.data)} pear brand stores")
                return response.data
            else:
                logger.warning("No pear brand stores found")
                return []

        except Exception as e:
            logger.error(f"Error getting pear brand stores: {str(e)}", exc_info=True)
            # For now, return empty array instead of raising exception to prevent frontend errors
            logger.info("Returning empty array due to error")
            return []

    @staticmethod
    async def get_store_by_id(store_id: str) -> dict[str, Any]:
        """Get a specific pear brand store by ID."""
        try:
            logger.info(f"Getting store by ID: {store_id}")

            from ..database.supabase_client import get_supabase_client

            supabase = get_supabase_client()

            response = supabase.table("pear_brand").select("*").eq("id", store_id).execute()

            if response.data and len(response.data) > 0:
                logger.info(f"Retrieved pear brand store: {store_id}")
                return response.data[0]
            else:
                logger.warning(f"Pear brand store not found: {store_id}")
                raise HTTPException(status_code=404, detail="Store not found")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting pear brand store by ID: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to retrieve store: {str(e)}")

    @staticmethod
    async def create_store(store_data) -> dict[str, Any]:
        """Create a new pear brand store."""
        try:
            logger.info(f"Creating store: {store_data.store_name}")

            from ..database.supabase_client import get_supabase_client

            supabase = get_supabase_client()

            # Prepare store data including store_logo
            store_dict = {
                "store_name": store_data.store_name,
                "store_link": store_data.store_link,
                "store_intro": store_data.store_intro,
            }

            # Add store_logo if provided
            if hasattr(store_data, "store_logo") and store_data.store_logo:
                store_dict["store_logo"] = store_data.store_logo

            # Insert into database
            response = supabase.table("pear_brand").insert(store_dict).execute()

            if response.data and len(response.data) > 0:
                store_id = response.data[0]["id"]
                logger.info(f"Successfully created pear brand store: {store_id}")

                return {
                    "success": True,
                    "message": "Store created successfully",
                    "store_id": store_id,
                }
            else:
                logger.error("Failed to create pear brand store - no data returned")
                raise HTTPException(status_code=500, detail="Failed to create store")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating pear brand store: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to create store: {str(e)}")
