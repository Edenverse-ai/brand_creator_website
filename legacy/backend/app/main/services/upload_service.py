import io
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, UploadFile

from ..config.settings import settings
from ..database.connection import supabase
from ..models.upload import UploadResponse

logger = logging.getLogger(__name__)


class UploadService:
    @staticmethod
    def _validate_file(file: UploadFile) -> None:
        """Validate uploaded file type and size."""
        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                400, f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
            )

        # Validate file size (5MB limit)
        if hasattr(file, "size") and file.size and file.size > 5 * 1024 * 1024:
            raise HTTPException(400, "File size must be less than 5MB")

    @staticmethod
    def _upload_to_campaigns_bucket(path: str, file: UploadFile) -> bool:
        """Upload file to campaigns bucket in Supabase storage."""
        try:
            logger.info(f"Uploading file to campaigns bucket at path: {path}")

            if not supabase:
                raise HTTPException(500, "Database connection not available")

            # Validate file size by reading content
            file.file.seek(0, 2)  # Seek to end
            file_size = file.file.tell()
            file.file.seek(0)  # Reset to beginning

            max_size = 5 * 1024 * 1024  # 5MB
            if file_size > max_size:
                raise HTTPException(
                    400, f"File too large. Maximum size is {max_size // (1024*1024)}MB"
                )

            # Read file content
            content = io.BytesIO(file.file.read())

            try:
                # Upload with file options
                file_options = {"content-type": file.content_type, "upsert": True}

                resp = supabase.storage.from_("campaigns").upload(
                    path, content.getvalue(), file_options
                )
                logger.info(f"Upload response: {resp}")
                return True

            except Exception as upload_err:
                logger.error(f"Upload error details: {str(upload_err)}")

                # Try alternate approach if first one fails
                try:
                    # Remove existing file if it exists
                    try:
                        supabase.storage.from_("campaigns").remove([path])
                        logger.info(f"Removed existing file at {path}")
                    except Exception:
                        pass

                    # Try simpler upload
                    resp = supabase.storage.from_("campaigns").upload(path, content.getvalue())
                    logger.info(f"Second upload response: {resp}")
                    return True

                except Exception as second_err:
                    logger.error(f"Second upload attempt failed: {str(second_err)}")
                    raise HTTPException(500, f"File upload failed: {str(second_err)}")

        except Exception as e:
            logger.error(f"Upload error: {str(e)}")
            raise HTTPException(500, f"Storage upload error: {str(e)}")

    @staticmethod
    def _get_public_url(file_path: str) -> str:
        """Get public URL for uploaded file."""
        try:
            if not supabase:
                raise HTTPException(500, "Database connection not available")

            public_url_response = supabase.storage.from_("campaigns").get_public_url(file_path)
            public_url = public_url_response
            logger.info(f"Generated public URL: {public_url}")
            return public_url
        except Exception as url_err:
            logger.error(f"Error getting public URL: {str(url_err)}")
            # Construct URL manually if needed
            return f"{settings.SUPABASE_URL}/storage/v1/object/public/campaigns/{file_path}"

    @staticmethod
    async def upload_general_file(file: UploadFile) -> UploadResponse:
        """Upload a general file for campaigns."""
        try:
            # Validate file
            UploadService._validate_file(file)

            # Generate unique filename
            file_extension = file.filename.split(".")[-1] if file.filename else "jpg"
            unique_filename = f"upload_{uuid.uuid4().hex}.{file_extension}"

            # Simple path for general uploads
            file_path = f"general/{unique_filename}"

            # Upload file
            UploadService._upload_to_campaigns_bucket(file_path, file)

            # Get public URL
            public_url = UploadService._get_public_url(file_path)

            return UploadResponse(
                success=True, url=public_url, path=file_path, message="File uploaded successfully"
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in upload_general_file: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to upload file")

    @staticmethod
    async def upload_product_photo(
        brand_id: str, campaign_id: str, file: UploadFile
    ) -> UploadResponse:
        """Upload product photo for a campaign with proper organization."""
        try:
            logger.info(
                f"Starting product photo upload for brand {brand_id}, campaign {campaign_id}"
            )

            # Validate required fields
            if not brand_id or not campaign_id:
                raise HTTPException(400, "brand_id and campaign_id are required")

            if not file:
                raise HTTPException(400, "No file provided")

            # Validate file
            UploadService._validate_file(file)

            # Generate unique filename
            file_extension = file.filename.split(".")[-1] if file.filename else "jpg"
            unique_filename = f"product_photo_{uuid.uuid4().hex}.{file_extension}"

            # Create folder structure: campaigns/{brand_id}/{campaign_id}/{filename}
            file_path = f"{brand_id}/{campaign_id}/{unique_filename}"

            # Upload file
            UploadService._upload_to_campaigns_bucket(file_path, file)

            # Get public URL
            public_url = UploadService._get_public_url(file_path)

            return UploadResponse(
                success=True,
                url=public_url,
                path=file_path,
                message="Product photo uploaded successfully",
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in upload_product_photo: {str(e)}")
            raise HTTPException(500, f"An unexpected error occurred: {str(e)}")

    @staticmethod
    async def setup_storage_bucket() -> dict[str, Any]:
        """Setup campaigns storage bucket."""
        try:
            if not supabase:
                raise HTTPException(500, "Database connection not available")

            # Check if bucket exists
            buckets_response = supabase.storage.list_buckets()
            logger.info(f"Buckets response: {buckets_response}")

            bucket_exists = False
            for bucket in buckets_response:
                if bucket.name == "campaigns":
                    bucket_exists = True
                    break

            if bucket_exists:
                return {"message": "Storage bucket 'campaigns' already exists", "status": "ready"}
            else:
                # Create the bucket as public since product photos need to be publicly accessible
                try:
                    bucket_name = "campaigns"
                    resp = supabase.storage.create_bucket(bucket_name, {"public": True})
                    return {
                        "message": "Storage bucket 'campaigns' created successfully",
                        "response": str(resp),
                    }
                except Exception as create_err:
                    return {"message": "Error creating bucket", "error": str(create_err)}

        except Exception as e:
            logger.error(f"Error in setup_storage_bucket: {str(e)}")
            raise HTTPException(500, f"Failed to set up storage: {str(e)}")

    @staticmethod
    async def test_upload_service() -> dict[str, Any]:
        """Test endpoint to verify the upload service is working."""
        return {
            "status": "ok",
            "message": "Campaign upload API is working",
            "timestamp": datetime.now().isoformat(),
        }

    @staticmethod
    async def diagnose_storage() -> dict[str, Any]:
        """Diagnose storage bucket status."""
        try:
            if not supabase:
                return {"error": "Database connection not available"}

            # Check storage buckets
            storage_buckets: list[dict[str, Any]] = []
            bucket_list_error = None
            try:
                buckets_response = supabase.storage.list_buckets()
                for bucket in buckets_response:
                    storage_buckets.append(
                        {"name": bucket.name, "public": getattr(bucket, "public", "unknown")}
                    )
            except Exception as bucket_err:
                bucket_list_error = f"Error listing buckets: {str(bucket_err)}"

            # Check if campaigns bucket exists and is accessible
            campaigns_bucket_status = "not_found"
            try:
                # Try to list files in campaigns bucket
                supabase.storage.from_("campaigns").list()
                campaigns_bucket_status = "accessible"
            except Exception as access_err:
                campaigns_bucket_status = f"error: {str(access_err)}"

            return {
                "storage_buckets": storage_buckets,
                "bucket_list_error": bucket_list_error,
                "campaigns_bucket_status": campaigns_bucket_status,
                "supabase_url": settings.SUPABASE_URL,
                "has_service_key": bool(settings.SUPABASE_SERVICE_KEY),
            }

        except Exception as e:
            return {"error": str(e)}
