"""
Data models for Campaign API
"""

from .ai_video import AiVideoGenerateResponse
from .campaign import Campaign, CampaignCreate
from .claim import CampaignClaimCreate, CampaignClaimResponse
from .contact import ContactFormData, ContactResponse
from .entertainment_live import (
    EntertainmentLive,
    EntertainmentLiveCreate,
    EntertainmentLiveResponse,
)
from .tiktokverify import TikTokVerification, TikTokVerificationCreate, TikTokVerificationResponse
from .upload import UploadResponse

__all__ = [
    "AiVideoGenerateResponse",
    "Campaign",
    "CampaignCreate",
    "CampaignClaimCreate",
    "CampaignClaimResponse",
    "UploadResponse",
    "ContactFormData",
    "ContactResponse",
    "EntertainmentLive",
    "EntertainmentLiveCreate",
    "EntertainmentLiveResponse",
    "TikTokVerification",
    "TikTokVerificationCreate",
    "TikTokVerificationResponse",
]
