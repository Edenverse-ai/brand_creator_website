import io
import logging
from datetime import datetime

from fastapi import HTTPException, UploadFile

from ..database.connection import supabase
from ..models.tiktokverify import TikTokVerificationCreate

logger = logging.getLogger(__name__)


class TikTokVerificationService:
    def __init__(self):
        self.supabase = supabase

    def _upload_to_bucket(self, path: str, file: UploadFile) -> bool:
        """Upload file to Supabase storage bucket"""
        try:
            logger.info(f"Uploading file to path: {path}")
            content = io.BytesIO(file.file.read())

            # Try to upload with correct parameter format
            try:
                # Combine file options into a single parameter
                file_options = {"content-type": file.content_type, "upsert": True}

                # Use file_options as the third argument
                resp = self.supabase.storage.from_("verification-assets").upload(
                    path, content.getvalue(), file_options
                )
                logger.info(f"Upload response: {resp}")
                return True
            except Exception as upload_err:
                logger.error(f"Upload error details: {str(upload_err)}")

                # Try alternate approach if first one fails
                try:
                    # First remove the file if it exists
                    try:
                        self.supabase.storage.from_("verification-assets").remove([path])
                        logger.info(f"Removed existing file at {path}")
                    except Exception:
                        # Ignore removal errors
                        pass

                    # Then try simpler upload without upsert option
                    resp = self.supabase.storage.from_("verification-assets").upload(
                        path, content.getvalue()
                    )
                    logger.info(f"Second upload response: {resp}")
                    return True
                except Exception as second_err:
                    logger.error(f"Second upload attempt failed: {str(second_err)}")
                    raise HTTPException(
                        500, f"File upload error after second attempt: {str(second_err)}"
                    )
        except Exception as e:
            logger.error(f"Upload error: {str(e)}")
            raise HTTPException(500, f"Storage upload error: {str(e)}")

    def check_id_exists(self, id_number: str) -> bool:
        """Check if ID number already exists in database"""
        try:
            existing = (
                self.supabase.table("influencer_verifications")
                .select("id")
                .eq("id_number", id_number)
                .execute()
            )
            return len(existing.data) > 0
        except Exception as e:
            logger.error(f"Error checking ID existence: {str(e)}")
            return False

    def upload_files(self, id_number: str, files: dict) -> dict:
        """Upload all verification files and return their paths"""
        folder = f"{id_number}"
        file_paths: dict[str, str] = {}

        try:
            # Upload each file with better error handling
            if files.get("id_front_file"):
                file_paths["id_front_path"] = (
                    f"{folder}/id_front.{files['id_front_file'].filename.split('.')[-1]}"
                )
                self._upload_to_bucket(file_paths["id_front_path"], files["id_front_file"])

            if files.get("handheld_id_file"):
                file_paths["handheld_id_path"] = (
                    f"{folder}/id_handheld.{files['handheld_id_file'].filename.split('.')[-1]}"
                )
                self._upload_to_bucket(file_paths["handheld_id_path"], files["handheld_id_file"])

            if files.get("backend_ss_file"):
                file_paths["backend_ss_path"] = (
                    f"{folder}/backend_ss.{files['backend_ss_file'].filename.split('.')[-1]}"
                )
                self._upload_to_bucket(file_paths["backend_ss_path"], files["backend_ss_file"])

            if files.get("signed_auth_file"):
                file_paths["authorization_path"] = (
                    f"{folder}/authorization.{files['signed_auth_file'].filename.split('.')[-1]}"
                )
                self._upload_to_bucket(file_paths["authorization_path"], files["signed_auth_file"])

            if files.get("identity_video_file"):
                file_paths["identity_video_path"] = (
                    f"{folder}/identity_video.{files['identity_video_file'].filename.split('.')[-1]}"
                )
                self._upload_to_bucket(
                    file_paths["identity_video_path"], files["identity_video_file"]
                )
            # identity_video_path is absent (not set) when no video file is provided

            logger.info("All files uploaded successfully")
            return file_paths
        except Exception as upload_error:
            logger.error(f"File upload error: {str(upload_error)}")
            raise HTTPException(500, f"File upload error: {str(upload_error)}")

    def create_verification(
        self, verification_data: TikTokVerificationCreate, file_paths: dict
    ) -> dict:
        """Create a new verification record in the database"""
        try:
            logger.info("Inserting record into database...")

            # Format date of birth
            dob = datetime.strptime(verification_data.date_of_birth, "%m/%d/%y").date()

            # Prepare the record data
            record = {
                "passport_name": verification_data.passport_name,
                "real_name": verification_data.real_name,
                "id_type": verification_data.id_type,
                "gender": verification_data.gender,
                "nationality": verification_data.nationality,
                "stage_name": verification_data.stage_name,
                "id_number": verification_data.id_number,
                "date_of_birth": dob.isoformat(),
                "account_intro": verification_data.account_intro,
                "overseas_platform_url": verification_data.overseas_platform_url,
                "follower_count": verification_data.follower_count,
                "other_platforms": verification_data.other_platforms,
                "agent_email": verification_data.agent_email,
                **file_paths,
            }

            # Insert into database
            insert_response = (
                self.supabase.table("influencer_verifications").insert(record).execute()
            )
            logger.info(f"Record inserted successfully: {insert_response}")

            return {
                "success": True,
                "message": "Verification submitted successfully",
                "data": record,
            }

        except Exception as e:
            logger.error(f"Database insert error: {str(e)}")
            raise HTTPException(500, f"Failed to save verification data: {str(e)}")

    def get_verification_by_id(self, verification_id: str) -> dict | None:
        """Get verification by ID"""
        try:
            result = (
                self.supabase.table("influencer_verifications")
                .select("*")
                .eq("id", verification_id)
                .execute()
            )

            if result.data:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching verification: {str(e)}")
            return None

    def get_verifications(self, limit: int = 50, offset: int = 0) -> list:
        """Get all verifications with pagination"""
        try:
            result = (
                self.supabase.table("influencer_verifications")
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )

            return result.data
        except Exception as e:
            logger.error(f"Error fetching verifications: {str(e)}")
            return []

    def setup_storage(self) -> dict:
        """Setup storage bucket if it doesn't exist"""
        try:
            # First check if the bucket already exists by listing all buckets
            buckets_response = self.supabase.storage.list_buckets()
            logger.info(f"Buckets response: {buckets_response}")

            # Check if our bucket is in the list
            bucket_exists = False
            for bucket in buckets_response:
                if bucket.name == "verification-assets":
                    bucket_exists = True
                    break

            if bucket_exists:
                return {
                    "message": "Storage bucket 'verification-assets' already exists",
                    "status": "ready",
                }
            else:
                # Need to create the bucket
                try:
                    bucket_name = "verification-assets"
                    resp = self.supabase.storage.create_bucket(bucket_name, {"public": False})
                    return {
                        "message": "Storage bucket 'verification-assets' created successfully",
                        "response": str(resp),
                    }
                except Exception as create_err:
                    return {"message": "Error creating bucket", "error": str(create_err)}
        except Exception as e:
            logger.error(f"Error in setup-storage: {str(e)}")
            raise HTTPException(500, f"Failed to set up storage: {str(e)}")

    def diagnose_database(self) -> dict:
        """Diagnose database and storage status"""
        try:
            # Check if table exists by trying a simple query
            try:
                (self.supabase.table("influencer_verifications").select("id").limit(1).execute())
                table_exists = True
                table_structure = "Table accessible via Supabase API"
            except Exception as table_error:
                table_exists = False
                table_structure = f"Table check error: {str(table_error)}"

            # Check storage buckets
            storage_buckets = []
            try:
                buckets_response = self.supabase.storage.list_buckets()
                for bucket in buckets_response:
                    storage_buckets.append(bucket.name)
            except Exception as bucket_err:
                storage_buckets = [f"Error listing buckets: {str(bucket_err)}"]

            return {
                "database_connected": True,
                "table_exists": table_exists,
                "table_structure": table_structure,
                "storage_buckets": storage_buckets,
            }
        except Exception as e:
            return {"database_connected": False, "error": str(e)}

    def generate_upload_urls(self, id_number: str, files: list) -> dict:
        """Generate pre-signed upload URLs for direct file uploads to Supabase"""
        try:
            folder = f"{id_number}"
            upload_urls = {}

            # Define file mapping
            file_mappings = {
                "id_front_file": "id_front",
                "handheld_id_file": "id_handheld",
                "backend_ss_file": "backend_ss",
                "signed_auth_file": "authorization",
                "identity_video_file": "identity_video",
            }

            for file_info in files:
                file_key = file_info.get("key")
                file_extension = file_info.get("extension", "jpg")

                if file_key in file_mappings:
                    file_name = file_mappings[file_key]
                    file_path = f"{folder}/{file_name}.{file_extension}"

                    try:
                        # Generate pre-signed URL for upload (expires in 1 hour)
                        signed_url_response = self.supabase.storage.from_(
                            "verification-assets"
                        ).create_signed_upload_url(file_path)

                        logger.info(f"Supabase response for {file_key}: {signed_url_response}")

                        # Handle different possible response formats
                        if isinstance(signed_url_response, dict):
                            # Check for different possible key names
                            upload_url = None
                            if "signedURL" in signed_url_response:
                                upload_url = signed_url_response["signedURL"]
                            elif "signed_url" in signed_url_response:
                                upload_url = signed_url_response["signed_url"]
                            elif "url" in signed_url_response:
                                upload_url = signed_url_response["url"]
                            else:
                                # If it's a direct URL string
                                upload_url = str(signed_url_response)
                        else:
                            # If response is a direct string URL
                            upload_url = str(signed_url_response)

                        if not upload_url:
                            raise Exception(
                                f"Could not extract upload URL from response: {signed_url_response}"
                            )

                        upload_urls[file_key] = {
                            "upload_url": upload_url,
                            "file_path": file_path,
                            "token": signed_url_response.get("token")
                            if isinstance(signed_url_response, dict)
                            else None,
                        }

                        logger.info(f"Generated upload URL for {file_key}: {file_path}")
                    except Exception as url_error:
                        logger.error(
                            f"Error generating upload URL for {file_key}: {str(url_error)}"
                        )
                        raise HTTPException(
                            500, f"Failed to generate upload URL for {file_key}: {str(url_error)}"
                        )

            return {"success": True, "upload_urls": upload_urls}

        except Exception as e:
            logger.error(f"Error generating upload URLs: {str(e)}")
            raise HTTPException(500, f"Failed to generate upload URLs: {str(e)}")

    def create_verification_with_paths(self, verification_data) -> dict:
        """Create a new verification record using pre-uploaded file paths"""
        try:
            logger.info("Creating verification record with file paths...")

            # Format date of birth
            dob = datetime.strptime(verification_data.date_of_birth, "%m/%d/%y").date()

            # Map the file paths from the frontend format to database format
            file_paths = {
                "id_front_path": verification_data.file_paths.get("id_front_file"),
                "handheld_id_path": verification_data.file_paths.get("handheld_id_file"),
                "backend_ss_path": verification_data.file_paths.get("backend_ss_file"),
                "authorization_path": verification_data.file_paths.get("signed_auth_file"),
                "identity_video_path": verification_data.file_paths.get("identity_video_file"),
            }

            # Prepare the record data
            record = {
                "passport_name": verification_data.passport_name,
                "real_name": verification_data.real_name,
                "id_type": verification_data.id_type,
                "gender": verification_data.gender,
                "nationality": verification_data.nationality,
                "stage_name": verification_data.stage_name,
                "id_number": verification_data.id_number,
                "date_of_birth": dob.isoformat(),
                "account_intro": verification_data.account_intro,
                "overseas_platform_url": verification_data.overseas_platform_url,
                "follower_count": verification_data.follower_count,
                "other_platforms": verification_data.other_platforms,
                "agent_email": verification_data.agent_email,
                **file_paths,
            }

            # Insert into database
            insert_response = (
                self.supabase.table("influencer_verifications").insert(record).execute()
            )
            logger.info(f"Record inserted successfully: {insert_response}")

            return {
                "success": True,
                "message": "Verification submitted successfully",
                "data": record,
            }

        except Exception as e:
            logger.error(f"Database insert error: {str(e)}")
            raise HTTPException(500, f"Failed to save verification data: {str(e)}")
