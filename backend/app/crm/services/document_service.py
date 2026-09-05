from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time import app_now_naive
from app.crm.models.document import CrmDocument
from app.crm.models.document_template import DocumentType
from app.crm.repositories.document_repository import DocumentRepository
from app.crm.repositories.order_repository import OrderRepository
from app.crm.repositories.user_repository import UserRepository
from app.crm.schemas.document import (
    DocumentFileRead,
    DocumentPreviewRead,
    DocumentPrintRead,
    DocumentOrderSummaryRead,
    DocumentRead,
    DocumentTemplateRead,
    DocumentWorkDatesUpdate,
)
from app.crm.schemas.order import OrderClientSummaryRead, OrderVehicleSummaryRead
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.document_pdf_converter_service import DocumentPdfConverterService
from app.crm.services.document_renderer_service import DocumentRendererService
from app.crm.services.document_storage_service import DocumentStorageService
from app.crm.services.document_template_service import DocumentTemplateService


class DocumentService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.documents = DocumentRepository(session)
        self.orders = OrderRepository(session)
        self.users = UserRepository(session)
        self.templates = DocumentTemplateService(session)
        self.storage = DocumentStorageService()
        self.renderer = DocumentRendererService()
        self.pdf_converter = DocumentPdfConverterService()
        self.audit_logs = AuditLogService(session)

    def _get_order(self, order_id: int):
        order = self.orders.get_by_id(order_id)
        if not order:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        return order

    def _get_user(self, user_id: int):
        user = self.users.get_by_id(user_id)
        if not user:
            raise AppError(code="not_found", message="Пользователь не найден", status_code=404)
        return user

    def _get_document(self, document_id: int) -> CrmDocument:
        document = self.documents.get_by_id(document_id)
        if not document:
            raise AppError(code="not_found", message="Документ не найден", status_code=404)
        return document

    def _build_file_payload(self, storage_path: str | None, mime_type: str) -> DocumentFileRead:
        path = Path(storage_path) if storage_path else None
        return DocumentFileRead(
            exists=bool(path and path.exists()),
            storage_path=str(path) if path else None,
            filename=path.name if path else None,
            mime_type=mime_type,
        )

    def _build_bundle(self, document: CrmDocument):
        template_path = self.storage.validate_template_path(document.template.storage_path)
        bundle = self.renderer.build_render_bundle(document, template_path)
        return template_path, bundle

    def _build_order_summary(self, document: CrmDocument) -> DocumentOrderSummaryRead:
        order = document.order
        vehicle = order.vehicle
        brand = vehicle.brand or ""
        model = vehicle.model or ""
        display_name = " · ".join(
            [part for part in [vehicle.plate_number_display, " ".join(part for part in [brand, model] if part).strip()] if part]
        )
        if not display_name:
            display_name = vehicle.plate_number_display
        return DocumentOrderSummaryRead(
            id=order.id,
            client_summary=OrderClientSummaryRead.model_validate(order.client),
            vehicle_summary=OrderVehicleSummaryRead(
                id=vehicle.id,
                client_id=vehicle.client_id,
                plate_number_display=vehicle.plate_number_display,
                brand=vehicle.brand,
                model=vehicle.model,
                vin=vehicle.vin,
                display_name=display_name,
            ),
        )

    def _build_download_headers(self, filename: str) -> dict[str, str]:
        normalized = unicodedata.normalize("NFKD", filename)
        ascii_fallback = normalized.encode("ascii", "ignore").decode("ascii")
        ascii_fallback = re.sub(r"[^A-Za-z0-9._-]+", "_", ascii_fallback).strip("._-")
        if "." in filename and "." not in ascii_fallback:
            ascii_fallback = f"{ascii_fallback}.{filename.rsplit('.', 1)[-1]}"
        ascii_fallback = ascii_fallback or "document"
        return {
            "content-disposition": f'attachment; filename="{ascii_fallback}"; filename*=utf-8\'\'{quote(filename)}'
        }

    def _to_read(self, document: CrmDocument) -> DocumentRead:
        return DocumentRead(
            id=document.id,
            order_id=document.order_id,
            order_summary=self._build_order_summary(document),
            template_id=document.template_id,
            created_by_user_id=document.created_by_user_id,
            document_type=document.document_type,
            document_number=document.document_number,
            work_started_at=document.work_started_at or document.order.created_at,
            work_completed_at=document.work_completed_at or document.order.completed_at,
            storage_docx_path=document.storage_docx_path,
            storage_pdf_path=document.storage_pdf_path,
            last_pdf_engine=document.last_pdf_engine,
            last_pdf_generation_note=document.last_pdf_generation_note,
            created_at=document.created_at,
            updated_at=document.updated_at,
            last_rendered_at=document.last_rendered_at,
            template=DocumentTemplateRead.model_validate(document.template),
            docx_file=self._build_file_payload(
                document.storage_docx_path,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            pdf_file=self._build_file_payload(document.storage_pdf_path, "application/pdf"),
            unresolved_placeholders=[],
            manual_fields_by_design=[],
        )

    def create(self, order_id: int, document_type: DocumentType, created_by_user_id: int) -> DocumentRead:
        order = self._get_order(order_id)
        self._get_user(created_by_user_id)
        existing = self.documents.get_by_order_and_type(order_id, document_type)
        if existing:
            raise AppError(
                code="document_type_exists",
                message="Документ этого типа уже существует для заказа",
                status_code=409,
            )
        template = self.templates.get_by_type(document_type)
        created_at = app_now_naive()
        document = CrmDocument(
            order_id=order.id,
            template_id=template.id,
            created_by_user_id=created_by_user_id,
            document_type=document_type,
            document_number=order.id,
            work_started_at=None,
            work_completed_at=None,
            created_at=created_at,
            updated_at=created_at,
        )
        self.documents.create(document)
        self.audit_logs.record(
            actor_user_id=created_by_user_id,
            entity_type="document",
            entity_id=document.id,
            action="create",
            title=f"Создан документ №{document.document_number}",
            description=str(document.document_type.value),
        )
        self.session.commit()
        return self.get(document.id)

    def get_or_create(self, order_id: int, document_type: DocumentType, created_by_user_id: int) -> DocumentRead:
        existing = self.documents.get_by_order_and_type(order_id, document_type)
        if existing:
            return self.get(existing.id)
        return self.create(order_id, document_type, created_by_user_id)

    def ensure(self, order_id: int, document_type: DocumentType, created_by_user_id: int) -> DocumentRead:
        return self.get_or_create(order_id, document_type, created_by_user_id)

    def list_by_order(self, order_id: int) -> list[DocumentRead]:
        self._get_order(order_id)
        return [self._to_read(document) for document in self.documents.list_by_order(order_id)]

    def get(self, document_id: int) -> DocumentRead:
        return self._to_read(self._get_document(document_id))

    def build_preview(self, document_id: int) -> DocumentPreviewRead:
        document = self._get_document(document_id)
        _, bundle = self._build_bundle(document)
        return DocumentPreviewRead(
            document_id=document.id,
            document_type=document.document_type,
            document_number=document.document_number,
            preview_content=bundle.preview_content,
            is_placeholder_rendering=False,
            rendered_at=document.last_rendered_at,
            unresolved_placeholders=bundle.unresolved_placeholders,
            manual_fields_by_design=bundle.manual_fields_by_design,
        )

    def render_docx(self, document_id: int) -> DocumentRead:
        document = self._get_document(document_id)
        template_path, bundle = self._build_bundle(document)
        docx_path = self.storage.get_docx_output_path(
            document.order_id,
            document.id,
            document.document_type,
            document.document_number,
            document.created_at,
        )
        self.renderer.write_docx(docx_path, template_path, bundle)
        document.storage_docx_path = str(docx_path)
        document.last_rendered_at = app_now_naive()
        self.session.commit()
        return self.get(document_id)

    def generate_pdf(self, document_id: int) -> DocumentRead:
        document = self._get_document(document_id)
        rendered = self.render_docx(document_id)
        document = self._get_document(rendered.id)
        _, bundle = self._build_bundle(document)
        pdf_path = self.storage.get_pdf_output_path(
            document.order_id,
            document.id,
            document.document_type,
            document.document_number,
            document.created_at,
        )
        docx_path = Path(document.storage_docx_path)
        conversion = self.pdf_converter.convert(docx_path, pdf_path, bundle)
        document.storage_pdf_path = str(pdf_path)
        document.last_pdf_engine = conversion.engine
        document.last_pdf_generation_note = conversion.note
        document.last_rendered_at = app_now_naive()
        self.session.commit()
        return self.get(document_id)

    def get_docx_file(self, document_id: int) -> DocumentFileRead:
        document = self.render_docx(document_id)
        return self._build_file_payload(
            document.storage_docx_path,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    def get_pdf_file(self, document_id: int) -> DocumentFileRead:
        document = self.generate_pdf(document_id)
        return self._build_file_payload(document.storage_pdf_path, "application/pdf")

    def build_order_document_docx_download_response(
        self,
        order_id: int,
        document_type: DocumentType,
        created_by_user_id: int,
    ) -> FileResponse:
        document = self.get_or_create(order_id, document_type, created_by_user_id)
        return self.build_docx_download_response(document.id)

    def build_order_document_pdf_download_response(
        self,
        order_id: int,
        document_type: DocumentType,
        created_by_user_id: int,
    ) -> FileResponse:
        document = self.get_or_create(order_id, document_type, created_by_user_id)
        return self.build_pdf_download_response(document.id)

    def build_docx_download_response(self, document_id: int) -> FileResponse:
        file_payload = self.get_docx_file(document_id)
        if not file_payload.exists or not file_payload.storage_path or not file_payload.filename:
            raise AppError(code="not_found", message="Файл DOCX не найден", status_code=404)
        return FileResponse(
            path=file_payload.storage_path,
            media_type=file_payload.mime_type,
            filename=file_payload.filename,
            headers=self._build_download_headers(file_payload.filename),
        )

    def build_pdf_download_response(self, document_id: int) -> FileResponse:
        file_payload = self.get_pdf_file(document_id)
        if not file_payload.exists or not file_payload.storage_path or not file_payload.filename:
            raise AppError(code="not_found", message="Файл PDF не найден", status_code=404)
        return FileResponse(
            path=file_payload.storage_path,
            media_type=file_payload.mime_type,
            filename=file_payload.filename,
            headers=self._build_download_headers(file_payload.filename),
        )

    def get_print_payload(self, document_id: int) -> DocumentPrintRead:
        document = self._get_document(document_id)
        if not document.storage_pdf_path:
            document = self._get_document(document_id)
            self.generate_pdf(document.id)
            document = self._get_document(document.id)
        return DocumentPrintRead(
            document_id=document.id,
            document_type=document.document_type,
            document_number=document.document_number,
            print_source=document.storage_pdf_path or document.storage_docx_path or "",
            is_placeholder_rendering=False,
        )

    def update_work_dates(self, document_id: int, payload: DocumentWorkDatesUpdate) -> DocumentRead:
        document = self._get_document(document_id)
        document.work_started_at = payload.work_started_at
        document.work_completed_at = payload.work_completed_at
        self.session.commit()
        return self.get(document_id)
