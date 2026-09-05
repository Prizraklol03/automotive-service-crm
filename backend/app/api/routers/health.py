from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_generated_documents_dir, get_runtime_dir, get_settings


router = APIRouter()


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    settings = get_settings()
    return {
        "status": "ok",
        "app_version": settings.app_version,
        "db": "ok",
    }


@router.get("/health/live")
def liveness_check() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ok",
        "app_version": settings.app_version,
    }


@router.get("/health/ready")
def readiness_check(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    runtime_dir = get_runtime_dir()
    documents_dir = get_generated_documents_dir()
    settings = get_settings()
    return {
        "status": "ok",
        "app_version": settings.app_version,
        "db": "ok",
        "runtime_dir": str(runtime_dir),
        "documents_dir": str(documents_dir),
    }
