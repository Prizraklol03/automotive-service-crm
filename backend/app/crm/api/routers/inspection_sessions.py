from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_roles
from app.crm.schemas.inspection import (
    InspectionActGenerateRead,
    InspectionExportPreviewRead,
    InspectionHistoryRead,
    InspectionSessionDetailRead,
    InspectionSessionPatch,
    InspectionSessionRead,
)
from app.crm.services.document_service import DocumentService
from app.crm.services.inspection_document_service import InspectionDocumentService
from app.crm.services.inspection_service import InspectionService

router = APIRouter()


@router.post("/orders/{order_id}/inspection-sessions/start", response_model=InspectionSessionDetailRead, status_code=status.HTTP_201_CREATED)
def start_inspection_session(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionSessionDetailRead:
    return InspectionService(db).start(order_id, current_user.user.id)


@router.get("/orders/{order_id}/inspection-sessions/current", response_model=InspectionSessionDetailRead | None)
def get_current_inspection_session(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> InspectionSessionDetailRead | None:
    return InspectionService(db).get_current_session(order_id)


@router.patch("/inspection-sessions/{session_id}", response_model=InspectionSessionRead)
def update_inspection_session(
    session_id: int,
    payload: InspectionSessionPatch,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionSessionRead:
    return InspectionService(db).update_session(session_id, payload, current_user.user.id)


@router.post("/inspection-sessions/{session_id}/complete", response_model=InspectionSessionRead)
def complete_inspection_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionSessionRead:
    return InspectionService(db).complete(session_id, current_user.user.id)


@router.post("/inspection-sessions/{session_id}/confirm", response_model=InspectionSessionRead)
def confirm_inspection_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionSessionRead:
    return InspectionService(db).confirm(session_id, current_user.user.id)


@router.post("/inspection-sessions/{session_id}/lock", response_model=InspectionSessionRead)
def lock_inspection_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionSessionRead:
    return InspectionService(db).lock(session_id, current_user.user.id)


@router.post("/inspection-sessions/{session_id}/reopen", response_model=InspectionSessionRead)
def reopen_inspection_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_roles("admin")),
) -> InspectionSessionRead:
    return InspectionService(db).reopen(session_id, current_user.user.id)


@router.get("/inspection-sessions/{session_id}/export-preview", response_model=InspectionExportPreviewRead)
def get_inspection_export_preview(
    session_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> InspectionExportPreviewRead:
    inspection_service = InspectionService(db)
    snapshot, export_payload = InspectionDocumentService(db).build_export_preview(session_id)
    session_read = inspection_service.to_session_read(inspection_service.get_session_model(session_id))
    return InspectionExportPreviewRead(session=session_read, snapshot=snapshot, export_payload=export_payload)


@router.post("/inspection-sessions/{session_id}/generate-act", response_model=InspectionActGenerateRead)
def generate_inspection_act(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> InspectionActGenerateRead:
    inspection_service = InspectionService(db)
    export_record, document = InspectionDocumentService(db).generate_act(session_id, current_user.user.id)
    return InspectionActGenerateRead(
        session=inspection_service.to_session_read(inspection_service.get_session_model(session_id)),
        export=inspection_service.to_export_read(export_record),
        document=DocumentService(db).get(document.id),
    )


@router.get("/inspection-sessions/{session_id}/history", response_model=InspectionHistoryRead)
def get_inspection_history(
    session_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> InspectionHistoryRead:
    return InspectionService(db).get_history(session_id)
