import logging
import os

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Try to load .env file - look in the api directory (parent of main)
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
    logger.info(f"Loaded .env file from: {env_path}")
else:
    # Also try loading from current working directory
    if os.path.exists(".env"):
        load_dotenv(".env")
        logger.info("Loaded .env file from current directory")
    else:
        logger.info("No .env file found, using environment variables")


class Settings:
    # Supabase configuration
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY", "")

    # CORS settings - more permissive for App Engine
    ALLOWED_ORIGINS: list[str] = [
        "https://cricher.ai",
        "https://www.cricher.ai",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.135:3000" "*",  # Allow all origins in production if needed
    ]

    # API settings
    API_VERSION: str = "1.0.0"
    API_TITLE: str = "Campaign API"

    # SMTP Settings (for contact form)
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_SECURE: bool = os.environ.get("SMTP_SECURE", "false").lower() == "true"
    SMTP_USER: str = os.environ.get("SMTP_USER", "")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")

    def __post_init__(self):
        """Validate critical settings"""
        if not self.SUPABASE_URL:
            logger.warning("SUPABASE_URL not set")
        if not self.SUPABASE_SERVICE_KEY:
            logger.warning("SUPABASE_SERVICE_KEY not set")


settings = Settings()

# Log configuration status for debugging
logger.info(f"SUPABASE_URL configured: {bool(settings.SUPABASE_URL)}")
logger.info(f"SUPABASE_SERVICE_KEY configured: {bool(settings.SUPABASE_SERVICE_KEY)}")
