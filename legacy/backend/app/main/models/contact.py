from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, field_serializer


class ContactFormData(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str
    email: EmailStr
    subject: str
    message: str
    timestamp: datetime | None = None

    @field_serializer("timestamp")
    def serialize_timestamp(cls, value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.isoformat()


class ContactResponse(BaseModel):
    success: bool
    message: str
    contact_id: str | None = None
    stored_in_database: bool | None = None


class ContactHealthStatus(BaseModel):
    status: str
    service: str
    timestamp: str
    database: str
    email_configured: bool


class ContactFormSchema(BaseModel):
    model_config = ConfigDict(extra="allow")
    fields: dict[str, dict[str, Any]]
    validation_rules: dict[str, Any]


class EmailTestResponse(BaseModel):
    success: bool
    message: str
    smtp_configured: bool
    smtp_host: str | None = None
    smtp_port: int | None = None


class ContactMessagesResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool | None = None
    messages: list[dict[str, Any]] | None = None
    count: int | None = None
    error: str | None = None


class ContactMessageStatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool | None = None
    message_id: int | None = None
    status: str | None = None
