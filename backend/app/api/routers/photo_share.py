"""Public (no-auth) endpoints for shared photo pages."""
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.client_ip import resolve_client_ip
from app.core.config import get_settings
from app.core.security import InMemoryRateLimiter
from app.crm.schemas.order_photo import PublicOrderPhotoRead
from app.crm.services.order_photo_service import OrderPhotoService

router = APIRouter()
_public_share_rate_limiter = InMemoryRateLimiter()


def reset_public_share_rate_limiter() -> None:
    _public_share_rate_limiter.clear()


def _consume_public_share_limit(request: Request, token: str, *, operation: str) -> None:
    settings = get_settings()
    client_ip = resolve_client_ip(request, settings.trusted_proxy_cidrs) or "unknown"
    client_digest = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
    if operation == "list":
        attempts = settings.public_photo_list_rate_limit_attempts
        window_seconds = settings.public_photo_list_rate_limit_window_seconds
    else:
        attempts = settings.public_photo_file_rate_limit_attempts
        window_seconds = settings.public_photo_file_rate_limit_window_seconds
    _public_share_rate_limiter.consume(
        f"public-photo:{operation}:client:{client_digest}",
        max_attempts=attempts,
        window_seconds=window_seconds,
    )


@router.get("/{token}", response_model=list[PublicOrderPhotoRead])
def list_shared_photos(
    token: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> list[PublicOrderPhotoRead]:
    _consume_public_share_limit(request, token, operation="list")
    service = OrderPhotoService(db)
    photos, _ = service.list_by_share_token(token)
    response.headers["Cache-Control"] = "no-store"
    return [
        PublicOrderPhotoRead(
            photo_key=service.get_public_photo_key(token, photo.id),
            stage=photo.stage,
            sort_order=photo.sort_order,
        )
        for photo in photos
    ]


@router.get("/{token}/photos/{photo_key}/file")
def serve_shared_photo(
    token: str,
    photo_key: str,
    request: Request,
    thumb: bool = False,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    _consume_public_share_limit(request, token, operation="file")
    service = OrderPhotoService(db)
    payload, media_type = service.get_shared_file_bytes(token, photo_key, thumbnail=thumb)
    return StreamingResponse(
        iter([payload]),
        media_type=media_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'inline; filename="photo.jpg"',
            "Content-Length": str(len(payload)),
            "X-Content-Type-Options": "nosniff",
        },
    )
