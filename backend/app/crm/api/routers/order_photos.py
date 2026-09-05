from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.errors import AppError
from app.crm.api.deps import CurrentUserContext, get_current_user
from app.crm.models.order_photo import PhotoStage
from app.crm.schemas.order_photo import OrderPhotoRead, OrderShareRead
from app.crm.services.order_photo_service import OrderPhotoService

router = APIRouter()

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB per file


# ──────────────────────────── upload ──────────────────────────────────────────

@router.post(
    "/{order_id}/photos",
    response_model=list[OrderPhotoRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_photos(
    order_id: int,
    stage: PhotoStage = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[OrderPhotoRead]:
    service = OrderPhotoService(db)
    results: list[OrderPhotoRead] = []
    for file in files:
        data = await file.read(_MAX_UPLOAD_BYTES + 1)
        if len(data) > _MAX_UPLOAD_BYTES:
            raise AppError(
                code="validation_error",
                message="Размер одного фото не должен превышать 20 МБ",
                status_code=422,
            )
        photo = service.upload(order_id, stage, data)
        results.append(OrderPhotoRead.model_validate(photo))
    return results


# ──────────────────────────── list ────────────────────────────────────────────

@router.get("/{order_id}/photos", response_model=list[OrderPhotoRead])
def list_photos(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[OrderPhotoRead]:
    service = OrderPhotoService(db)
    return [OrderPhotoRead.model_validate(p) for p in service.list_by_order(order_id)]


# ── share routes MUST be before {photo_id} routes to avoid path-param conflict ─

@router.get("/{order_id}/photos/share", response_model=OrderShareRead)
def get_share_info(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> OrderShareRead:
    service = OrderPhotoService(db)
    token, _ = service.get_share_info(order_id)
    return OrderShareRead(share_token=token, share_url=None)


@router.post("/{order_id}/photos/share", response_model=OrderShareRead)
def generate_share(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> OrderShareRead:
    service = OrderPhotoService(db)
    token = service.generate_share_token(order_id)
    return OrderShareRead(share_token=token, share_url=None)


@router.delete("/{order_id}/photos/share", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def revoke_share(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> Response:
    OrderPhotoService(db).revoke_share_token(order_id)
    return Response(status_code=204)


# ──────────────────────────── serve file (auth) ───────────────────────────────

@router.get("/{order_id}/photos/{photo_id}/file")
def serve_photo(
    order_id: int,
    photo_id: int,
    thumb: bool = False,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> FileResponse:
    service = OrderPhotoService(db)
    path = service.get_file_path(order_id, photo_id, thumbnail=thumb)
    return FileResponse(path, media_type="image/jpeg")


# ──────────────────────────── delete ──────────────────────────────────────────

@router.delete("/{order_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_photo(
    order_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> Response:
    OrderPhotoService(db).delete(order_id, photo_id)
    return Response(status_code=204)
