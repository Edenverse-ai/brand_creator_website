"""
Database module for Campaign API
"""

from .connection import create_supabase_client, supabase

__all__ = ["supabase", "create_supabase_client"]
