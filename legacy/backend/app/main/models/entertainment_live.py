from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EntertainmentLive(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    created_at: datetime | None = None
    task_title: str
    brand_id: str
    campaign_objective: str | None = None
    platform: str | None = None
    task_start_at: datetime | None = None
    task_end_at: datetime | None = None
    follower_min: int | None = None
    follower_max: int | None = None
    niche_tags: list[str] | str | None = None
    region_priority: str | None = None
    content_quality_floor: str | None = None
    deliverables: str | None = None
    mandatory_elements: str | None = None
    creative_guidelines: str | None = None
    prohibited_elements: str | None = None
    reward_model: str | None = None
    fixed_reward: float | None = None
    tiered_table: str | None = None
    cps_rate: float | None = None
    kpi_baseline: str | None = None
    updated_at: datetime | None = None
    brand_name: str | None = None  # For joined data


class EntertainmentLiveCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_title: str
    brand_id: str
    campaign_objective: str | None = None
    platform: str | None = None
    task_start_at: datetime | None = None
    task_end_at: datetime | None = None
    follower_min: int | None = None
    follower_max: int | None = None
    niche_tags: list[str] | str | None = None
    region_priority: str | None = None
    content_quality_floor: str | None = None
    deliverables: str | None = None
    mandatory_elements: str | None = None
    creative_guidelines: str | None = None
    prohibited_elements: str | None = None
    reward_model: str | None = None
    fixed_reward: float | None = None
    tiered_table: str | None = None
    cps_rate: float | None = None
    kpi_baseline: str | None = None


class EntertainmentLiveResponse(BaseModel):
    success: bool
    message: str
    data: dict | None = None
