from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PearBrand(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: UUID
    created_at: datetime | None = None
    store_name: str
    store_link: str
    store_intro: str
    store_logo: str | None = None


class PearBrandCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    store_name: str
    store_link: str
    store_intro: str
    store_logo: str | None = None


class PearBrandResponse(BaseModel):
    success: bool
    message: str
    data: dict | None = None
