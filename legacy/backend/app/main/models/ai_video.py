from pydantic import BaseModel


class AiVideoGenerateResponse(BaseModel):
    request_id: str
    creator_id: str
    prompt: str
    voice_sample_url: str | None = None
    image_url: str | None = None
    storage_path: str
    status: str
    message: str


class AiVideoLibraryItem(BaseModel):
    id: str
    creator_id: str
    generated_time: str
    video_url: str
    tags: list[str]
    created_at: str | None = None
    thumbnail_url: str | None = None
