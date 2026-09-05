"""Compatibility re-exports for the CRM v2.0 dependency module."""

from app.crm.api.deps import CurrentUserContext, get_current_user, get_db, get_session_token_service, require_roles

__all__ = [
    "CurrentUserContext",
    "get_current_user",
    "get_db",
    "get_session_token_service",
    "require_roles",
]
