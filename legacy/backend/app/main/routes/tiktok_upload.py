import logging
import math

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl

from ..database.connection import supabase

router = APIRouter(prefix="/tiktok", tags=["tiktok"])
logger = logging.getLogger(__name__)

BUCKET_NAME = "aivideogenerated"


class UploadVideo(BaseModel):
    id: str | None = None
    video_url: HttpUrl | None = Field(None, alias="videoUrl")
    video_path: str | None = Field(None, alias="videoPath")
    title: str | None = None
    brand_content_toggle: bool | None = Field(None, alias="brandContent")
    brand_organic_toggle: bool | None = Field(None, alias="brandOrganic")
    privacy_level: str | None = Field(None, alias="privacyLevel")
    disable_comment: bool | None = Field(None, alias="disableComment")
    disable_duet: bool | None = Field(None, alias="disableDuet")
    disable_stitch: bool | None = Field(None, alias="disableStitch")

    model_config = {
        "populate_by_name": True,
        "alias_generator": None,
        "allow_population_by_field_name": True,
    }


class UploadRequest(BaseModel):
    access_token: str
    videos: list[UploadVideo]


class PublishStatusRequest(BaseModel):
    access_token: str
    publish_ids: list[str] = Field(default_factory=list)


def _required_brand_flags(video: UploadVideo):
    # Defaults to organic posts unless explicitly overridden
    return (
        False if video.brand_content_toggle is None else video.brand_content_toggle,
        True if video.brand_organic_toggle is None else video.brand_organic_toggle,
    )


async def _init_tiktok_publish(
    client: httpx.AsyncClient,
    access_token: str,
    title: str | None,
    video_size: int,
    chunk_size: int,
    total_chunk_count: int,
    video: UploadVideo,
):
    brand_content_toggle, brand_organic_toggle = _required_brand_flags(video)
    if not video.privacy_level:
        raise HTTPException(status_code=400, detail="Missing privacy_level for TikTok upload")
    payload = {
        "post_info": {
            "title": (title or "AI video")[:150],
            # TikTok privacy options: PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY
            "privacy_level": video.privacy_level,
            "brand_content_toggle": brand_content_toggle,
            "brand_organic_toggle": brand_organic_toggle,
            "disable_comment": True if video.disable_comment is None else video.disable_comment,
            "disable_duet": True if video.disable_duet is None else video.disable_duet,
            "disable_stitch": True if video.disable_stitch is None else video.disable_stitch,
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": video_size,
            "chunk_size": chunk_size,
            "total_chunk_count": total_chunk_count,
        },
    }
    resp = await client.post(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
        timeout=30,
    )
    data = resp.json() if resp.content else {}
    upload_url = data.get("data", {}).get("upload_url")
    publish_id = data.get("data", {}).get("publish_id")
    if not resp.is_success or not upload_url or not publish_id:
        raise HTTPException(
            status_code=502,
            detail={"message": "TikTok init failed", "payload": data},
        )
    return upload_url, publish_id


async def _signed_supabase_url(path: str) -> str:
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client unavailable")
    try:
        signed = supabase.storage.from_(BUCKET_NAME).create_signed_url(path, 60 * 30)
        if isinstance(signed, dict):
            signed_url = signed.get("signedURL") or signed.get("signed_url")
        else:
            signed_url = signed
        if not signed_url:
            raise HTTPException(status_code=500, detail="Failed to sign Supabase path")
        return signed_url
    except Exception as exc:
        logger.error("Supabase signed URL error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to sign Supabase path")


async def _fetch_video_size(client: httpx.AsyncClient, source_url: str) -> int:
    """Fetch content length without downloading the full object."""
    try:
        head_resp = await client.head(source_url, follow_redirects=True)
        content_length = head_resp.headers.get("Content-Length")
        if content_length and content_length.isdigit():
            size = int(content_length)
            if size > 0:
                return size
    except Exception as exc:
        logger.warning("HEAD request failed when fetching video size: %s", exc)

    # Fallback to range request to extract size from Content-Range
    try:
        range_resp = await client.get(
            source_url,
            headers={"Range": "bytes=0-0"},
            follow_redirects=True,
        )
        content_range = range_resp.headers.get("Content-Range")
        if content_range and "/" in content_range:
            try:
                size = int(content_range.rsplit("/", 1)[-1])
                if size > 0:
                    return size
            except ValueError:
                pass
    except Exception as exc:
        logger.error("Range request failed when fetching video size: %s", exc)

    raise HTTPException(status_code=502, detail="Unable to determine video size")


async def _stream_upload(upload_url: str, source_url: str, video_size: int) -> None:
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("GET", source_url) as src:
            if src.status_code != 200:
                text = await src.aread()
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "Failed to read source video",
                        "status": src.status_code,
                        "body": text.decode(errors="ignore"),
                    },
                )

            put_resp = await client.put(
                upload_url,
                headers={
                    "Content-Type": "video/mp4",
                    "Content-Length": str(video_size),
                    "Content-Range": f"bytes 0-{video_size - 1}/{video_size}",
                },
                content=src.aiter_bytes(),
            )

            if not put_resp.is_success:
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "TikTok upload failed",
                        "status": put_resp.status_code,
                        "body": put_resp.text,
                    },
                )


async def _fetch_publish_status(client: httpx.AsyncClient, access_token: str, publish_id: str):
    resp = await client.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"publish_id": publish_id},
        timeout=30,
    )
    data = resp.json() if resp.content else {}
    if not resp.is_success:
        raise HTTPException(
            status_code=502,
            detail={"message": "TikTok publish status fetch failed", "payload": data},
        )
    return data


@router.post("/upload-ai-video")
async def upload_ai_video(body: UploadRequest):
    if not body.videos:
        raise HTTPException(status_code=400, detail="No videos provided")

    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for video in body.videos:
            try:
                source_url: str | None = None
                if video.video_url:
                    source_url = str(video.video_url)
                elif video.video_path:
                    source_url = await _signed_supabase_url(video.video_path)

                if not source_url:
                    raise HTTPException(status_code=400, detail="Missing video_url or video_path")

                video_size = await _fetch_video_size(client, source_url)
                # Single-chunk upload to TikTok; chunk size equals the video size
                chunk_size = video_size
                total_chunk_count = max(1, math.ceil(video_size / chunk_size))

                upload_url, publish_id = await _init_tiktok_publish(
                    client,
                    body.access_token,
                    video.title,
                    video_size,
                    chunk_size,
                    total_chunk_count,
                    video,
                )

                await _stream_upload(upload_url, source_url, video_size)
                publish_status = await _fetch_publish_status(client, body.access_token, publish_id)

                results.append(
                    {
                        "id": video.id,
                        "status": "ok",
                        "publish_id": publish_id,
                        "publish_status": publish_status,
                    }
                )
            except HTTPException as exc:
                results.append({"id": video.id, "status": "error", "error": exc.detail})
            except Exception as exc:  # pragma: no cover - unexpected
                logger.error("Unexpected TikTok upload error: %s", exc)
                results.append(
                    {"id": video.id, "status": "error", "error": "Unexpected server error"}
                )

    return {"results": results}


@router.post("/publish-status")
async def publish_status(body: PublishStatusRequest):
    if not body.publish_ids:
        raise HTTPException(status_code=400, detail="No publish_ids provided")

    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for publish_id in body.publish_ids:
            try:
                status_payload = await _fetch_publish_status(client, body.access_token, publish_id)
                results.append(
                    {"publish_id": publish_id, "status": "ok", "payload": status_payload}
                )
            except HTTPException as exc:
                results.append({"publish_id": publish_id, "status": "error", "error": exc.detail})
            except Exception as exc:  # pragma: no cover
                logger.error("Unexpected publish status error: %s", exc)
                results.append(
                    {
                        "publish_id": publish_id,
                        "status": "error",
                        "error": "Unexpected server error",
                    }
                )

    return {"results": results}
