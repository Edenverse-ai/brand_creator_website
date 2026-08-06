"""
Database module for Campaign API
"""

import logging

from .connection import create_supabase_client, supabase

logger = logging.getLogger(__name__)

__all__ = ["supabase", "create_supabase_client"]


def get_supabase_client():
    """Get Supabase client instance."""
    try:
        return create_supabase_client()
    except Exception as e:
        logger.error(f"Failed to create Supabase client: {e}")
        raise
