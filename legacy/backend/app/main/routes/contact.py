import logging

from fastapi import APIRouter, HTTPException, Path, Query, Request

from ..models.contact import (
    ContactFormData,
    ContactFormSchema,
    ContactHealthStatus,
    ContactMessagesResponse,
    ContactMessageStatusResponse,
    ContactResponse,
    EmailTestResponse,
)
from ..services.contact_service import ContactService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/submit", response_model=ContactResponse)
async def submit_contact_form(request: Request, contact_data: ContactFormData):
    """Submit a contact form with enhanced database handling."""
    return await ContactService.submit_contact_form(contact_data)


@router.get("/health", response_model=ContactHealthStatus)
async def contact_health_check():
    """Health check for contact API including database status."""
    return await ContactService.get_health_status()


@router.get("/schema", response_model=ContactFormSchema)
async def get_contact_form_schema():
    """Return the contact form schema for frontend validation."""
    return await ContactService.get_form_schema()


@router.post("/test-email", response_model=EmailTestResponse)
async def test_email_configuration():
    """Test email configuration by sending a test email."""
    return await ContactService.test_email_configuration()


@router.get("/messages", response_model=ContactMessagesResponse)
async def get_contact_messages(
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of messages"),
    offset: int = Query(0, ge=0, description="Number of messages to skip"),
):
    """Get contact messages from database (admin only)."""
    return await ContactService.get_contact_messages(status, limit, offset)


@router.patch("/messages/{message_id}/status", response_model=ContactMessageStatusResponse)
async def update_message_status(
    request: Request, message_id: int = Path(..., description="Message ID")
):
    """Update the status of a contact message."""
    try:
        body = await request.json()
        status = body.get("status")

        if not status:
            raise HTTPException(status_code=400, detail="Status is required")

        return await ContactService.update_message_status(message_id, status)
    except Exception as e:
        logger.error(f"Error in update_message_status endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update message status")
