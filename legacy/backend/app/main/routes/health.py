from fastapi import APIRouter

from ..config.settings import settings
from ..database.connection import supabase
from ..models.common import GenericStatusResponse, SQLScriptResponse
from ..utils.validators import validate_supabase_connection

router = APIRouter()


@router.get("/health", response_model=GenericStatusResponse)
async def health_check():
    """API health check endpoint."""
    connection_ok, connection_msg = await validate_supabase_connection(supabase)

    env_vars = {
        "SUPABASE_URL": settings.SUPABASE_URL if settings.SUPABASE_URL else "Not set",
        "SUPABASE_SERVICE_KEY": "****" if settings.SUPABASE_SERVICE_KEY else "Not set",
    }

    return {
        "status": "ok",
        "supabase": {
            "configured": supabase is not None,
            "connection": connection_ok,
            "message": connection_msg,
        },
        "environment": env_vars,
        "api_version": settings.API_VERSION,
    }


@router.get("/setup-sql", response_model=SQLScriptResponse)
async def get_setup_sql():
    """Return SQL that can be used to set up the necessary tables and permissions."""
    from ..database.schemas import CREATE_TABLE_SQL

    return {"sql": CREATE_TABLE_SQL}
