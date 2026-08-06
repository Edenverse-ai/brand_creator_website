from pydantic import BaseModel


class UploadResponse(BaseModel):
    success: bool
    url: str
    path: str
    message: str
