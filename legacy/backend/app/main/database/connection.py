import logging

from supabase import Client, create_client

from ..config.settings import settings

logger = logging.getLogger(__name__)


def create_supabase_client() -> Client:
    """Initialize and return Supabase client."""
    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_SERVICE_KEY

    if not supabase_url or not supabase_key:
        logger.error(
            f"Missing Supabase environment variables. URL present: {bool(supabase_url)}, Key present: {bool(supabase_key)}"
        )
        logger.error(
            "Please check your .env file and ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set"
        )
        return None

    logger.info(f"Initializing Supabase client with URL: {supabase_url[:30]}...")
    try:
        supabase_client = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully")
        return supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {str(e)}")
        return None


# Global supabase client instance
supabase = create_supabase_client()

# Log the initialization status
if supabase:
    logger.info("Global Supabase client created successfully")
else:
    logger.warning("Global Supabase client is None - check your configuration")
