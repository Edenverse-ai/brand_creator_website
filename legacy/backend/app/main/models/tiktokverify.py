from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class TikTokVerification(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str | None = None
    created_at: datetime | None = None
    passport_name: str
    real_name: str
    id_type: str
    gender: str
    nationality: str
    stage_name: str | None = None
    id_number: str
    date_of_birth: str
    account_intro: str
    overseas_platform_url: str
    follower_count: int
    other_platforms: str | None = None
    agent_email: str
    id_front_path: str | None = None
    handheld_id_path: str | None = None
    backend_ss_path: str | None = None
    authorization_path: str | None = None
    identity_video_path: str | None = None


class TikTokVerificationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    passport_name: str
    real_name: str
    id_type: str
    gender: str
    nationality: str
    stage_name: str | None = None
    id_number: str
    date_of_birth: str
    account_intro: str
    overseas_platform_url: str
    follower_count: int
    other_platforms: str | None = None
    agent_email: str


class TikTokVerificationWithPaths(BaseModel):
    model_config = ConfigDict(extra="allow")
    passport_name: str
    real_name: str
    id_type: str
    gender: str
    nationality: str
    stage_name: str | None = None
    id_number: str
    date_of_birth: str
    account_intro: str
    overseas_platform_url: str
    follower_count: int
    other_platforms: str | None = None
    agent_email: str
    file_paths: dict[str, Any]  # Contains the file paths from direct uploads


class TikTokVerificationResponse(BaseModel):
    success: bool
    message: str | None = None
    data: dict | None = None


class TikTokVerificationListResponse(BaseModel):
    success: bool
    data: list[dict[str, Any]]
    pagination: dict[str, Any]


class UploadUrlEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    upload_url: str
    file_path: str
    token: str | None = None


class UploadUrlsResponse(BaseModel):
    success: bool
    upload_urls: dict[str, UploadUrlEntry]


class TikTokHealthResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    status: str
    timestamp: str
    service: str
    version: str
    checks: dict[str, dict[str, Any]]
    error: str | None = None


class TikTokDiagnosticsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    database_connected: bool
    table_exists: bool | None = None
    table_structure: Any | None = None
    storage_buckets: Any | None = None
    error: str | None = None


class TikTokSetupResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    message: str
    status: str | None = None
    response: str | None = None
    error: str | None = None
