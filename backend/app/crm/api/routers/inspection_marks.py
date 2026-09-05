from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.errors import AppError
from app.crm.api.deps import CurrentUserContext, get_current_user
from app.crm.schemas.inspection import (
    InspectionGeneralPhotoRead,
    InspectionMarkCreatePayload,
    InspectionMarkPhotoRead,
    InspectionMarkRead,
    InspectionMarkReorderPayload,
    InspectionMarkUpdatePayload,
)
from app.crm.services.inspection_service import InspectionService

router = APIRouter()

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@router.get("/inspection-sessions/{session_id}/marks", response_model=list[InspectionMarkRead])
def list_inspection_marks(
    session_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[InspectionMarkRead]:
    return InspectionService(db).list_marks(session_id)


@router.post("/inspection-sessions/{session_id}/marks", response_model=InspectionMarkRead, status_code=status.HTTP_201_CREATED)
def create_inspection_mark(
    session_id: int,
    payload: InspectionMarkCreatePayload,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionMarkRead:
    return InspectionService(db).create_mark(session_id, payload, current_user.user.id)


@router.get("/inspection-marks/{mark_id}", response_model=InspectionMarkRead)
def get_inspection_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> InspectionMarkRead:
    return InspectionService(db).get_mark_read(mark_id)


@router.patch("/inspection-marks/{mark_id}", response_model=InspectionMarkRead)
def update_inspection_mark(
    mark_id: int,
    payload: InspectionMarkUpdatePayload,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionMarkRead:
    return InspectionService(db).update_mark(mark_id, payload, current_user.user.id)


@router.delete("/inspection-marks/{mark_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_inspection_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> Response:
    InspectionService(db).delete_mark(mark_id, current_user.user.id)
    return Response(status_code=204)


@router.post("/inspection-marks/reorder", response_model=list[InspectionMarkRead])
def reorder_inspection_marks(
    payload: InspectionMarkReorderPayload,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> list[InspectionMarkRead]:
    return InspectionService(db).reorder_marks(payload, current_user.user.id)


@router.post("/inspection-marks/{mark_id}/photos", response_model=list[InspectionMarkPhotoRead], status_code=status.HTTP_201_CREATED)
async def upload_inspection_mark_photos(
    mark_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> list[InspectionMarkPhotoRead]:
    service = InspectionService(db)
    uploaded: list[InspectionMarkPhotoRead] | None = None
    for file in files:
        data = await file.read(_MAX_UPLOAD_BYTES + 1)
        if len(data) > _MAX_UPLOAD_BYTES:
            raise AppError(
                code="validation_error",
                message="Размер одного файла не должен превышать 20 МБ",
                status_code=422,
            )
        uploaded = service.upload_mark_photo(
            mark_id,
            original_name=file.filename or "photo.jpg",
            mime_type=file.content_type or "application/octet-stream",
            size_bytes=len(data),
            file_bytes=data,
            actor_user_id=current_user.user.id,
        )
    return uploaded or []


@router.delete("/inspection-mark-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_inspection_mark_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> Response:
    InspectionService(db).delete_mark_photo(photo_id, current_user.user.id)
    return Response(status_code=204)


@router.get("/inspection-sessions/{session_id}/marks/{mark_id}/photos/{photo_id}/file")
def serve_inspection_mark_photo(
    session_id: int,
    mark_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> FileResponse:
    path = InspectionService(db).get_mark_photo_file_path(session_id=session_id, mark_id=mark_id, photo_id=photo_id)
    return FileResponse(path, media_type="image/jpeg")


@router.post(
    "/inspection-sessions/{session_id}/general-photos",
    response_model=list[InspectionGeneralPhotoRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_inspection_general_photos(
    session_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> list[InspectionGeneralPhotoRead]:
    service = InspectionService(db)
    uploaded: list[InspectionGeneralPhotoRead] | None = None
    for file in files:
        data = await file.read(_MAX_UPLOAD_BYTES + 1)
        if len(data) > _MAX_UPLOAD_BYTES:
            raise AppError(
                code="validation_error",
                message="Размер одного файла не должен превышать 20 МБ",
                status_code=422,
            )
        uploaded = service.upload_general_photo(
            session_id,
            original_name=file.filename or "photo.jpg",
            mime_type=file.content_type or "application/octet-stream",
            size_bytes=len(data),
            file_bytes=data,
            actor_user_id=current_user.user.id,
        )
    return uploaded or []


@router.delete("/inspection-general-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_inspection_general_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> Response:
    InspectionService(db).delete_general_photo(photo_id, current_user.user.id)
    return Response(status_code=204)


@router.get("/inspection-sessions/{session_id}/general-photos/{photo_id}/file")
def serve_inspection_general_photo(
    session_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> FileResponse:
    path = InspectionService(db).get_general_photo_file_path(session_id=session_id, photo_id=photo_id)
    return FileResponse(path, media_type="image/jpeg")
