from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.models.document_template import DocumentType
from app.crm.schemas.document import DocumentPreviewRead, DocumentPrintRead, DocumentRead, DocumentWorkDatesUpdate
from app.crm.services.document_service import DocumentService

router = APIRouter()


@router.get("/orders/{order_id}/documents", response_model=list[DocumentRead])
def list_order_documents(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> list[DocumentRead]:
    return DocumentService(db).list_by_order(order_id)


@router.post("/orders/{order_id}/documents/{document_type}", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def create_order_document(
    order_id: int,
    document_type: DocumentType,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentRead:
    return DocumentService(db).create(order_id, document_type, current_user.user.id)


@router.post("/orders/{order_id}/documents/{document_type}/ensure", response_model=DocumentRead)
def ensure_order_document(
    order_id: int,
    document_type: DocumentType,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentRead:
    return DocumentService(db).ensure(order_id, document_type, current_user.user.id)


@router.post("/orders/{order_id}/documents/{document_type}/download/docx", response_class=FileResponse)
def download_order_document_docx(
    order_id: int,
    document_type: DocumentType,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> FileResponse:
    return DocumentService(db).build_order_document_docx_download_response(order_id, document_type, current_user.user.id)


@router.post("/orders/{order_id}/documents/{document_type}/download/pdf", response_class=FileResponse)
def download_order_document_pdf(
    order_id: int,
    document_type: DocumentType,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> FileResponse:
    return DocumentService(db).build_order_document_pdf_download_response(order_id, document_type, current_user.user.id)


@router.get("/documents/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentRead:
    return DocumentService(db).get(document_id)


@router.put("/documents/{document_id}/work-dates", response_model=DocumentRead)
def update_document_work_dates(
    document_id: int,
    payload: DocumentWorkDatesUpdate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentRead:
    return DocumentService(db).update_work_dates(document_id, payload)


@router.post("/documents/{document_id}/render", response_model=DocumentRead)
def render_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentRead:
    return DocumentService(db).render_docx(document_id)


@router.post("/documents/{document_id}/generate-pdf", response_model=DocumentRead)
def generate_document_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentRead:
    return DocumentService(db).generate_pdf(document_id)


@router.get("/documents/{document_id}/preview", response_model=DocumentPreviewRead)
def preview_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentPreviewRead:
    return DocumentService(db).build_preview(document_id)


@router.get("/documents/{document_id}/download/docx", response_class=FileResponse)
def get_document_docx(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> FileResponse:
    return DocumentService(db).build_docx_download_response(document_id)


@router.get("/documents/{document_id}/download/pdf", response_class=FileResponse)
def get_document_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> FileResponse:
    return DocumentService(db).build_pdf_download_response(document_id)


@router.post("/documents/{document_id}/print", response_model=DocumentPrintRead)
def print_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.documents")),
) -> DocumentPrintRead:
    return DocumentService(db).get_print_payload(document_id)
