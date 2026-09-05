"""Compatibility router entrypoint used by app startup and tests."""

from fastapi import APIRouter

from app.api.routers.health import router as health_router
from app.api.routers.photo_share import router as photo_share_router
from app.crm.api.routers import crm_api_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(crm_api_router)
api_router.include_router(photo_share_router, prefix="/p", tags=["photo-share"])

__all__ = ["api_router"]
