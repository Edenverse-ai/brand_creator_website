import logging
import uuid

from supabase import Client

logger = logging.getLogger(__name__)


def validate_uuid(uuid_string: str) -> bool:
    """Validate if a string is a valid UUID format."""
    try:
        uuid.UUID(uuid_string)
        return True
    except ValueError:
        return False


async def check_table_exists(supabase_client: Client, table_name: str) -> bool:
    """Check if a table exists in Supabase."""
    try:
        supabase_client.table(table_name).select("id").limit(1).execute()
        return True
    except Exception as e:
        logger.error(f"Error checking if table '{table_name}' exists: {str(e)}")
        return False


async def validate_supabase_connection(supabase_client: Client) -> tuple[bool, str]:
    """Test the Supabase connection and check permissions."""
    if not supabase_client:
        return False, "Supabase client not initialized"

    try:
        # Try a simple query that should work with minimal permissions
        supabase_client.table("campaigns").select("id").limit(1).execute()
        logger.info("Supabase connection test successful")
        return True, "Connection successful"
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Supabase connection test failed: {error_msg}")

        if "permission denied" in error_msg.lower():
            return False, "Permission denied. The service key may not have proper permissions."
        elif "not found" in error_msg.lower():
            return False, "Resource not found. The function or table may not exist."
        else:
            return False, f"Connection failed: {error_msg}"
