from typing import Any

from pydantic import BaseModel, ConfigDict


class GenericStatusResponse(BaseModel):
    """Simple status/message envelope that tolerates additional keys."""

    model_config = ConfigDict(extra="allow")
    success: bool | None = None
    status: str | None = None
    message: str | None = None
    detail: str | None = None


class StorageBucketInfo(BaseModel):
    """Represents a storage bucket entry returned from Supabase."""

    model_config = ConfigDict(extra="allow")
    name: str
    public: Any | None = None


class StorageDiagnosticsResponse(BaseModel):
    """Detailed diagnostics payload for the upload storage health check."""

    model_config = ConfigDict(extra="allow")
    storage_buckets: list[Any]
    campaigns_bucket_status: str
    supabase_url: str | None = None
    has_service_key: bool | None = None
    error: str | None = None


class SQLScriptResponse(BaseModel):
    """Simple wrapper for SQL setup scripts."""

    model_config = ConfigDict(extra="allow")
    sql: str
