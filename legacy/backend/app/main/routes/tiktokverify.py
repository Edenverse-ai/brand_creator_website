import logging
from datetime import UTC, datetime

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..models.common import GenericStatusResponse
from ..models.tiktokverify import (
    TikTokDiagnosticsResponse,
    TikTokHealthResponse,
    TikTokSetupResponse,
    TikTokVerificationCreate,
    TikTokVerificationListResponse,
    TikTokVerificationResponse,
    TikTokVerificationWithPaths,
    UploadUrlsResponse,
)
from ..services.tiktokverify import TikTokVerificationService

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize service
verification_service = TikTokVerificationService()


# Request models
class FileInfo(BaseModel):
    key: str
    extension: str


class UploadUrlsRequest(BaseModel):
    id_number: str
    files: list[FileInfo]


@router.get("/", response_model=GenericStatusResponse)
async def get_tiktok_verification_info():
    """Get TikTok verification API information"""
    return {
        "message": "TikTok Verification API",
        "endpoints": {
            "submit_verification": "POST /verification",
            "generate_upload_urls": "POST /upload-urls",
            "get_verification": "GET /verification/{verification_id}",
            "get_verifications": "GET /verifications",
            "setup_storage": "GET /setup-storage",
            "setup_database": "GET /setup-database",
            "diagnose": "GET /diagnose-database",
            "health": "GET /health",
            "test": "GET /test",
        },
        "status": "active",
    }


@router.post("/verification", response_model=TikTokVerificationResponse)
async def upload_verification(
    # ------------ plain fields ------------
    passport_name: str = Form(...),
    real_name: str = Form(...),
    id_type: str = Form(...),
    gender: str = Form(...),
    nationality: str = Form(...),
    stage_name: str | None = Form(None),
    id_number: str = Form(...),
    date_of_birth: str = Form(...),  # mm/dd/yy format
    account_intro: str = Form(...),
    overseas_platform_url: str = Form(...),
    follower_count: int = Form(...),
    other_platforms: str | None = Form(None),
    agent_email: str = Form(...),
    # ------------ files ------------
    id_front_file: UploadFile = File(...),
    handheld_id_file: UploadFile = File(...),
    backend_ss_file: UploadFile = File(...),
    signed_auth_file: UploadFile = File(...),
    identity_video_file: UploadFile | None = File(None),
):
    """Submit TikTok verification application"""
    try:
        logger.info("Starting verification process...")

        # Check if ID number already exists
        if verification_service.check_id_exists(id_number):
            raise HTTPException(400, "This ID number has already been submitted.")

        # Create verification data object
        verification_data = TikTokVerificationCreate(
            passport_name=passport_name,
            real_name=real_name,
            id_type=id_type,
            gender=gender,
            nationality=nationality,
            stage_name=stage_name,
            id_number=id_number,
            date_of_birth=date_of_birth,
            account_intro=account_intro,
            overseas_platform_url=overseas_platform_url,
            follower_count=follower_count,
            other_platforms=other_platforms,
            agent_email=agent_email,
        )

        # Prepare files dictionary
        files = {
            "id_front_file": id_front_file,
            "handheld_id_file": handheld_id_file,
            "backend_ss_file": backend_ss_file,
            "signed_auth_file": signed_auth_file,
            "identity_video_file": identity_video_file,
        }

        # Upload files and get paths
        file_paths = verification_service.upload_files(id_number, files)

        # Create verification record
        result = verification_service.create_verification(verification_data, file_paths)

        return TikTokVerificationResponse(
            success=True, message="Verification submitted successfully", data=result.get("data")
        )

    except HTTPException:
        # Re-raise HTTP exceptions to preserve status codes
        raise
    except Exception as e:
        # Catch-all for unexpected errors
        logger.error(f"Unexpected error in upload_verification: {str(e)}")
        raise HTTPException(500, f"An unexpected error occurred: {str(e)}")


@router.post("/upload-urls", response_model=UploadUrlsResponse)
async def generate_upload_urls(request: UploadUrlsRequest):
    """Generate pre-signed upload URLs for direct file uploads to Supabase"""
    try:
        logger.info(f"Generating upload URLs for ID: {request.id_number}")

        # Convert Pydantic models to dict for the service
        files_list = [file_info.dict() for file_info in request.files]

        result = verification_service.generate_upload_urls(request.id_number, files_list)

        return result

    except HTTPException:
        # Re-raise HTTP exceptions to preserve status codes
        raise
    except Exception as e:
        logger.error(f"Unexpected error generating upload URLs: {str(e)}")
        raise HTTPException(500, f"Failed to generate upload URLs: {str(e)}")


@router.post("/verification-with-paths", response_model=TikTokVerificationResponse)
async def submit_verification_with_paths(verification_data: TikTokVerificationWithPaths):
    """Submit verification with pre-uploaded file paths (bypasses Netlify limits)"""
    try:
        logger.info(f"Processing verification with paths for ID: {verification_data.id_number}")

        # Check if ID already exists
        if verification_service.check_id_exists(verification_data.id_number):
            raise HTTPException(400, f"ID number {verification_data.id_number} already exists")

        # Create verification record with the provided file paths
        result = verification_service.create_verification_with_paths(verification_data)

        return TikTokVerificationResponse(
            success=True, message="Verification submitted successfully", data=result.get("data")
        )

    except HTTPException:
        # Re-raise HTTP exceptions to preserve status codes
        raise
    except Exception as e:
        logger.error(f"Unexpected error in submit_verification_with_paths: {str(e)}")
        raise HTTPException(500, f"An unexpected error occurred: {str(e)}")


@router.get("/verification/{verification_id}", response_model=TikTokVerificationResponse)
async def get_verification(verification_id: str):
    """Get verification by ID"""
    try:
        verification = verification_service.get_verification_by_id(verification_id)
        if not verification:
            raise HTTPException(404, "Verification not found")

        return {"success": True, "data": verification}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching verification: {str(e)}")
        raise HTTPException(500, f"Failed to fetch verification: {str(e)}")


@router.get("/verifications", response_model=TikTokVerificationListResponse)
async def get_verifications(limit: int = 50, offset: int = 0):
    """Get all verifications with pagination"""
    try:
        verifications = verification_service.get_verifications(limit, offset)
        return {
            "success": True,
            "data": verifications,
            "pagination": {"limit": limit, "offset": offset, "count": len(verifications)},
        }
    except Exception as e:
        logger.error(f"Error fetching verifications: {str(e)}")
        raise HTTPException(500, f"Failed to fetch verifications: {str(e)}")


@router.get("/setup-storage", response_model=TikTokSetupResponse)
async def setup_storage():
    """Setup storage bucket for verification assets"""
    try:
        result = verification_service.setup_storage()
        return result
    except Exception as e:
        logger.error(f"Error setting up storage: {str(e)}")
        raise HTTPException(500, f"Failed to set up storage: {str(e)}")


@router.get("/setup-database", response_model=TikTokSetupResponse)
async def setup_database():
    """Check database table status"""
    try:
        # Check if table exists by trying a simple query
        try:
            verification_service.supabase.table("influencer_verifications").select("id").limit(
                1
            ).execute()
            return {"message": "Table 'influencer_verifications' exists and is accessible"}
        except Exception as table_error:
            logger.error(f"Table check error: {str(table_error)}")
            return {
                "message": "Table may not exist. Please create it manually in the Supabase dashboard."
            }
    except Exception as e:
        logger.error(f"Error setting up database: {str(e)}")
        raise HTTPException(500, f"Failed to set up database: {str(e)}")


@router.get("/diagnose-database", response_model=TikTokDiagnosticsResponse)
async def diagnose_database():
    """Diagnose database and storage status"""
    try:
        result = verification_service.diagnose_database()
        return result
    except Exception as e:
        logger.error(f"Error diagnosing database: {str(e)}")
        raise HTTPException(500, f"Failed to diagnose database: {str(e)}")


@router.get("/health", response_model=TikTokHealthResponse)
async def health_check():
    """Health check endpoint for TikTok verification service"""
    try:
        # Check database connectivity
        db_status = "healthy"
        db_message = "Database connection successful"
        try:
            verification_service.supabase.table("influencer_verifications").select("id").limit(
                1
            ).execute()
        except Exception as db_error:
            db_status = "unhealthy"
            db_message = f"Database connection failed: {str(db_error)}"
            logger.warning(f"Database health check failed: {db_error}")

        # Check storage connectivity
        storage_status = "healthy"
        storage_message = "Storage service accessible"
        try:
            # Test storage connectivity by checking if we can access the bucket
            verification_service.supabase.storage.list_buckets()
        except Exception as storage_error:
            storage_status = "unhealthy"
            storage_message = f"Storage service failed: {str(storage_error)}"
            logger.warning(f"Storage health check failed: {storage_error}")

        # Overall health status
        overall_status = (
            "healthy" if db_status == "healthy" and storage_status == "healthy" else "degraded"
        )

        return {
            "status": overall_status,
            "timestamp": datetime.now(UTC).isoformat(),
            "service": "TikTok Verification API",
            "version": "1.0.0",
            "checks": {
                "database": {"status": db_status, "message": db_message},
                "storage": {"status": storage_status, "message": storage_message},
            },
        }

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.now(UTC).isoformat(),
            "service": "TikTok Verification API",
            "version": "1.0.0",
            "error": str(e),
        }


@router.get("/test", response_model=GenericStatusResponse)
async def test_endpoint():
    """Test endpoint to verify API is working"""
    return {"status": "ok", "message": "TikTok Verification API is working"}
