from fastapi import APIRouter, File, Form, Query, UploadFile

from ..models.ai_video import AiVideoGenerateResponse, AiVideoLibraryItem
from ..services.ai_video_service import AiVideoService

router = APIRouter(prefix="/ai-videos", tags=["ai-videos"])


@router.post("/generate", response_model=AiVideoGenerateResponse)
async def create_ai_video_request(
    creator_id: str = Form(...),
    prompt: str = Form(...),
    voice_sample: UploadFile | None = File(None),
    reference_image: UploadFile | None = File(None),
) -> AiVideoGenerateResponse:
    """
    Accept a new AI video generation request.

    Files are stored in the `ai-videos` storage bucket under
    `{creator_id}/{request_id}/` to avoid collisions.
    """

    return await AiVideoService.create_video_request(
        creator_id=creator_id,
        prompt=prompt,
        voice_sample=voice_sample,
        image=reference_image,
    )


@router.get("/library", response_model=list[AiVideoLibraryItem])
async def list_ai_videos(
    creator_id: str | None = Query(None, description="Filter by creator ID"),
):
    """
    Fetch generated AI videos for the creator portal grid.
    """

    return await AiVideoService.get_video_library(creator_id=creator_id)
