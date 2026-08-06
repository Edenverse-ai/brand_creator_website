import logging

from fastapi import APIRouter, Body, HTTPException, Path, Query

from ..models.entertainment_live import (
    EntertainmentLive,
    EntertainmentLiveCreate,
    EntertainmentLiveResponse,
)
from ..services.entertainment_live import EntertainmentLiveService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=list[EntertainmentLive])
async def get_entertainment_live_missions(
    search: str | None = Query(
        None, description="Search term for task title or campaign objective"
    ),
    platform: str | None = Query(None, description="Filter by platform"),
    region: str | None = Query(None, description="Filter by region priority"),
    reward_model: str | None = Query(None, description="Filter by reward model"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of missions to return"),
):
    """Get all entertainment live missions with optional filtering."""
    return await EntertainmentLiveService.get_entertainment_live_missions(
        search, platform, region, reward_model, limit
    )


@router.get("/{mission_id}", response_model=EntertainmentLive)
async def get_entertainment_live_mission_by_id(
    mission_id: str = Path(..., description="The ID of the entertainment live mission"),
):
    """Get a specific entertainment live mission by ID."""
    return await EntertainmentLiveService.get_entertainment_live_mission_by_id(mission_id)


@router.post("/brand-missions/{brand_id}/add_mission", response_model=EntertainmentLiveResponse)
async def add_entertainment_live_mission(
    brand_id: str = Path(..., description="The user ID or brand profile ID of the brand"),
    mission: EntertainmentLiveCreate = Body(
        ..., description="Entertainment live mission details to create"
    ),
):
    """Create a new entertainment live mission for a specific brand."""
    logger.info(
        f"Received entertainment live mission creation request for brand_id: {brand_id}, task title: {mission.task_title}"
    )

    # Add validation for brand_id
    if not brand_id or brand_id.strip() == "":
        raise HTTPException(status_code=400, detail="Brand ID is required")

    try:
        result = await EntertainmentLiveService.create_entertainment_live_mission(brand_id, mission)
        logger.info(f"Entertainment live mission creation successful: {result}")

        return EntertainmentLiveResponse(
            success=result["success"],
            message=result["message"],
            data={"mission_id": result["mission_id"]},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in add_entertainment_live_mission endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create entertainment live mission")


@router.put(
    "/brand-missions/{brand_id}/mission/{mission_id}", response_model=EntertainmentLiveResponse
)
async def update_entertainment_live_mission(
    brand_id: str = Path(..., description="The user ID of the brand"),
    mission_id: str = Path(..., description="The ID of the mission"),
    mission_update: EntertainmentLiveCreate = Body(..., description="Updated mission details"),
):
    """Update an existing entertainment live mission for a specific brand."""
    result = await EntertainmentLiveService.update_entertainment_live_mission(
        brand_id, mission_id, mission_update
    )

    return EntertainmentLiveResponse(
        success=result["success"],
        message=result["message"],
        data={"mission_id": result["mission_id"]},
    )


@router.delete(
    "/brand-missions/{brand_id}/mission/{mission_id}", response_model=EntertainmentLiveResponse
)
async def delete_entertainment_live_mission(
    brand_id: str = Path(..., description="The user ID of the brand"),
    mission_id: str = Path(..., description="The ID of the mission"),
):
    """Delete an entertainment live mission for a specific brand."""
    result = await EntertainmentLiveService.delete_entertainment_live_mission(brand_id, mission_id)

    return EntertainmentLiveResponse(
        success=result["success"],
        message=result["message"],
        data={"mission_id": result["mission_id"]},
    )
