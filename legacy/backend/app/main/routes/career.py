import logging

from fastapi import APIRouter, HTTPException

from ..models.career import CareerApplicationData, CareerApplicationResponse
from ..services.career_service import CareerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/career", tags=["career"])


@router.post("/apply", response_model=CareerApplicationResponse)
async def submit_career_application(application_data: CareerApplicationData):
    """
    Submit a career application.

    This endpoint:
    1. Stores the application in the database
    2. Sends a confirmation email to the applicant

    Args:
        application_data: Career application form data

    Returns:
        CareerApplicationResponse with success status and application ID
    """
    try:
        logger.info(f"Processing career application for position: {application_data.position}")
        return await CareerService.submit_career_application(application_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in career application endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail="An unexpected error occurred while processing your application"
        )


@router.get("/health")
async def career_health_check():
    """Health check endpoint for career application service."""
    return {"status": "ok", "service": "career_application", "endpoints": ["/api/career/apply"]}
