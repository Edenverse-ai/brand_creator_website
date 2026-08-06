import logging

from fastapi import APIRouter, Body, HTTPException, Path, Query

from ..models.pear import PearBrand, PearBrandCreate, PearBrandResponse
from ..services.pear import PearService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[PearBrand])
async def get_pear_stores(
    search: str | None = Query(None, description="Search term for store name or intro"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of stores to return"),
):
    """Get all pear brand stores with optional filtering."""
    logger.info(f"Getting pear stores with search='{search}', limit={limit}")
    return await PearService.get_all_stores(search, limit)


@router.get("/{store_id}", response_model=PearBrand)
async def get_pear_store_by_id(
    store_id: str = Path(..., description="The ID of the pear brand store"),
):
    """Get a specific pear brand store by ID."""
    logger.info(f"Getting pear store by ID: {store_id}")
    return await PearService.get_store_by_id(store_id)


@router.post("/", response_model=PearBrandResponse)
async def create_pear_store(
    store: PearBrandCreate = Body(..., description="Pear brand store details to create"),
):
    """Create a new pear brand store."""
    logger.info(f"Received pear brand store creation request: {store.store_name}")

    try:
        result = await PearService.create_store(store)
        logger.info(f"Pear brand store creation successful: {result}")

        return PearBrandResponse(
            success=result["success"],
            message=result["message"],
            data={"store_id": result["store_id"]},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in create_pear_store endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create pear brand store")
