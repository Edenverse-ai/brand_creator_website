import json
import logging
import uuid

from fastapi import HTTPException, UploadFile

from ..config.settings import settings
from ..database.connection import supabase
from ..models.ai_video import AiVideoGenerateResponse, AiVideoLibraryItem

logger = logging.getLogger(__name__)


class AiVideoService:
    """Service layer responsible for storing AI video generation requests."""

    BUCKET_NAME = "aivideogenerated"
    MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB

    IMAGE_MIME_TYPES: set[str] = {"image/jpeg", "image/png", "image/webp"}
    VOICE_MIME_TYPES: set[str] = {
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
        "audio/aac",
        "audio/mp4",
        "audio/x-m4a",
    }

    EXTENSION_CONTENT_TYPES = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "aac": "audio/aac",
        "m4a": "audio/mp4",
        "webm": "audio/webm",
    }

    @classmethod
    async def create_video_request(
        cls,
        creator_id: str,
        prompt: str,
        voice_sample: UploadFile | None,
        image: UploadFile | None,
    ) -> AiVideoGenerateResponse:
        """Persist a new AI video request and organize assets in storage."""
        logger.info("Creating AI video request for creator_id=%s", creator_id)
        client = cls._require_supabase()

        if not creator_id or not creator_id.strip():
            raise HTTPException(status_code=400, detail="creator_id is required")

        if not prompt or not prompt.strip():
            raise HTTPException(status_code=400, detail="prompt is required")

        request_id = str(uuid.uuid4())
        storage_root = f"{creator_id}/{request_id}"

        voice_sample_url = await cls._store_optional_asset(
            client=client,
            file=voice_sample,
            folder=storage_root,
            filename_prefix="voice-sample",
            allowed_types=cls.VOICE_MIME_TYPES,
            default_extension="wav",
        )

        image_url = await cls._store_optional_asset(
            client=client,
            file=image,
            folder=storage_root,
            filename_prefix="reference-image",
            allowed_types=cls.IMAGE_MIME_TYPES,
            default_extension="jpg",
        )

        payload = {
            "id": request_id,
            "creator_id": creator_id,
            "prompt": prompt.strip(),
            "voice_sample": voice_sample_url,
            "image": image_url,
        }

        try:
            client.table("AiVideoRequest").insert(payload).execute()
            logger.info("Stored AiVideoRequest record %s", request_id)
        except Exception as exc:
            logger.error("Failed to insert AiVideoRequest record: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to save AI video request")

        return AiVideoGenerateResponse(
            request_id=request_id,
            creator_id=creator_id,
            prompt=payload["prompt"],
            voice_sample_url=voice_sample_url,
            image_url=image_url,
            storage_path=storage_root,
            status="queued",
            message="AI video request queued successfully",
        )

    @classmethod
    async def get_video_library(cls, creator_id: str | None = None) -> list[AiVideoLibraryItem]:
        if not supabase:
            logger.warning("Supabase not available, returning empty AI video list")
            return []
        client = supabase
        query = client.table("AiVideo").select("*").order("generated_time", desc=True)
        if creator_id:
            query = query.eq("creator_id", creator_id)

        query_url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/AiVideo?select=*&order=generated_time.desc"
        if creator_id:
            query_url = f"{query_url}&creator_id=eq.{creator_id}"
        logger.info("Supabase AiVideo query: %s", query_url)

        try:
            response = query.execute()
        except Exception as exc:
            logger.warning("Failed to fetch AiVideos (returning empty list): %s", exc)
            return []

        records: list[AiVideoLibraryItem] = []
        for row in response.data or []:
            try:
                video_url = cls._resolve_video_url(client, row)
                if not video_url:
                    logger.warning(
                        "Skipping AiVideos row %s due to missing video URL", row.get("id")
                    )
                    continue

                tags = cls._deserialize_tags(row.get("tag"))
                thumbnail_url = cls._resolve_thumbnail_url(client, row)
                record = AiVideoLibraryItem(
                    id=row.get("id"),
                    creator_id=row.get("creator_id"),
                    generated_time=row.get("generated_time") or row.get("created_at"),
                    video_url=video_url,
                    tags=tags,
                    created_at=row.get("created_at"),
                    thumbnail_url=thumbnail_url,
                )
                records.append(record)
            except Exception as parse_exc:
                logger.warning("Skipping AiVideos row due to parse error: %s", parse_exc)
        return records

    @classmethod
    def _require_supabase(cls):
        if not supabase:
            logger.error("Supabase client is not configured")
            raise HTTPException(status_code=500, detail="Supabase client not configured")
        return supabase

    @classmethod
    async def _store_optional_asset(
        cls,
        client,
        file: UploadFile | None,
        folder: str,
        filename_prefix: str,
        allowed_types: set[str],
        default_extension: str,
    ) -> str | None:
        """Upload the provided file to storage and return its public URL."""
        if not file:
            return None

        cls._validate_content_type(file, allowed_types, filename_prefix)

        raw_content = await cls._read_file(file)
        extension = cls._extract_extension(file.filename, default_extension)
        storage_path = f"{folder}/{filename_prefix}.{extension}"
        options = {
            "content-type": file.content_type or cls._guess_content_type(extension),
            "upsert": True,
        }

        cls._upload_to_bucket(client, storage_path, raw_content, options, filename_prefix)
        return cls._get_public_url(client, storage_path)

    @classmethod
    def _validate_content_type(
        cls, file: UploadFile, allowed_types: set[str], asset_label: str
    ) -> None:
        if file.content_type and allowed_types and file.content_type not in allowed_types:
            readable = ", ".join(sorted(allowed_types))
            raise HTTPException(
                status_code=400,
                detail=f"{asset_label.replace('-', ' ').capitalize()} must be one of: {readable}",
            )

    @classmethod
    async def _read_file(cls, file: UploadFile) -> bytes:
        content = await file.read()
        file.file.seek(0)

        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        if len(content) > cls.MAX_FILE_BYTES:
            raise HTTPException(
                status_code=400, detail="File too large. Maximum size is 25MB per upload"
            )

        return content

    @classmethod
    def _extract_extension(cls, filename: str | None, default_extension: str) -> str:
        if not filename or "." not in filename:
            return default_extension
        return filename.rsplit(".", 1)[1].lower()

    @classmethod
    def _guess_content_type(cls, extension: str) -> str:
        return cls.EXTENSION_CONTENT_TYPES.get(extension.lower(), "application/octet-stream")

    @classmethod
    def _get_public_url(cls, client, path: str) -> str:
        try:
            response = client.storage.from_(cls.BUCKET_NAME).get_public_url(path)
            return response
        except Exception as exc:
            logger.error("Failed to resolve public URL for %s: %s", path, exc)
            base_url = settings.SUPABASE_URL.rstrip("/")
            return f"{base_url}/storage/v1/object/public/{cls.BUCKET_NAME}/{path}"

    @classmethod
    def _upload_to_bucket(
        cls, client, path: str, content: bytes, file_options: dict, asset_label: str
    ) -> None:
        """Mirror upload logic from UploadService for consistent behavior."""
        try:
            client.storage.from_(cls.BUCKET_NAME).upload(path, content, file_options)
            logger.info("Uploaded %s to %s bucket", path, cls.BUCKET_NAME)
        except Exception as exc:
            logger.error("Upload error for %s: %s", path, exc)
            # Attempt to remove stale file then retry, similar to UploadService
            try:
                client.storage.from_(cls.BUCKET_NAME).remove([path])
                logger.info("Removed existing object at %s before retry", path)
            except Exception:
                pass

            try:
                client.storage.from_(cls.BUCKET_NAME).upload(path, content)
                logger.info("Fallback upload succeeded for %s", path)
            except Exception as retry_exc:
                logger.error("Retry upload failed for %s: %s", path, retry_exc)
                raise HTTPException(
                    status_code=500,
                    detail=f"Unable to upload {asset_label.replace('-', ' ')} asset to storage",
                )

    @staticmethod
    def _deserialize_tags(raw_value: str | None) -> list[str]:
        if not raw_value:
            return []
        try:
            parsed = json.loads(raw_value)
            if isinstance(parsed, list):
                return [str(tag) for tag in parsed]
        except json.JSONDecodeError:
            pass
        return [segment.strip() for segment in raw_value.split(",") if segment.strip()]

    @classmethod
    def _generate_signed_url(cls, client, path: str, expires_in: int = 300) -> str | None:
        if not path:
            return None
        try:
            # Extend signed URL lifetime to roughly one month for easier downloads from the portal.
            long_lived_expiry = 60 * 60 * 24 * 30
            result = client.storage.from_(cls.BUCKET_NAME).create_signed_url(
                path, expires_in or long_lived_expiry
            )
            if isinstance(result, dict):
                return result.get("signedURL") or result.get("signed_url")
            if isinstance(result, str):
                return result
            return None
        except Exception as exc:
            logger.error("Failed to generate signed URL for %s: %s", path, exc)
            return None

    @classmethod
    def _resolve_video_url(cls, client, row: dict) -> str | None:
        direct_url = row.get("video_url") or row.get("videoUrl")
        if direct_url:
            return direct_url

        video_path = row.get("video") or row.get("video_path") or row.get("videoKey")
        if video_path:
            return cls._generate_signed_url(client, video_path)

        return None

    @classmethod
    def _resolve_thumbnail_url(cls, client, row: dict) -> str | None:
        raw_value = row.get("thumbnail_url") or row.get("thumbnailUrl") or row.get("thumbnail")
        if not raw_value:
            return None

        if isinstance(raw_value, str) and raw_value.startswith(("http://", "https://")):
            return raw_value

        return cls._generate_signed_url(client, raw_value)
