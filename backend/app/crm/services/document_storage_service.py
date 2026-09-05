from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.core.config import get_document_templates_dir, get_generated_documents_dir
from app.core.errors import AppError
from app.core.paths import resolve_path_within_root
from app.crm.models.document_template import DocumentType


class DocumentStorageService:
    ROOT_TEMPLATE_FILES = {
        DocumentType.PRELIMINARY_WORK_ORDER: "ПредварительныйЗаказНаряд шаблон.docx",
        DocumentType.WORK_ORDER: "Рабочий заказ-наряд шаблон.docx",
        DocumentType.COMPLETION_ACT: "Заказ наряд шаблон.docx",
        DocumentType.INSPECTION_ACT: "Акт приёма передачи авто шаблон.docx",
    }

    EXPORT_TYPE_PARTS = {
        DocumentType.PRELIMINARY_WORK_ORDER: "предварительный_заказ_наряд",
        DocumentType.WORK_ORDER: "рабочий_заказ_наряд",
        DocumentType.COMPLETION_ACT: "заказ_наряд",
        DocumentType.INSPECTION_ACT: "акт_приема_передачи_автомобиля",
    }

    def get_template_path(self, document_type: DocumentType) -> Path:
        return get_document_templates_dir() / self.ROOT_TEMPLATE_FILES[document_type]

    def ensure_template_file(self, document_type: DocumentType) -> Path:
        path = self.get_template_path(document_type)
        if not path.exists():
            raise FileNotFoundError(f"Template file not found: {path}")
        return path

    def replace_template_file(self, document_type: DocumentType, content: bytes) -> Path:
        path = self.get_template_path(document_type)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f"{path.name}.uploading")
        temp_path.write_bytes(content)
        temp_path.replace(path)
        return path

    def validate_template_path(self, storage_path: str | None) -> Path:
        if not storage_path:
            raise AppError(code="template_not_found", message="Template file not found: <empty>", status_code=404)
        path = resolve_path_within_root(get_document_templates_dir(), storage_path)
        if path is None:
            raise AppError(code="template_not_found", message="Template path is outside allowed directory", status_code=404)
        if not path.exists():
            raise AppError(code="template_not_found", message=f"Template file not found: {path}", status_code=404)
        return path

    def get_document_dir(self, order_id: int, document_id: int) -> Path:
        path = get_generated_documents_dir() / f"order-{order_id}" / f"document-{document_id}"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def build_export_filename(
        self,
        document_type: DocumentType,
        document_number: int,
        created_at: datetime,
        extension: str,
    ) -> str:
        type_part = self.EXPORT_TYPE_PARTS[document_type]
        date_part = created_at.strftime("%d_%m_%Y")
        return f"{type_part}_№{document_number}_{date_part}.{extension}"

    def get_docx_output_path(
        self,
        order_id: int,
        document_id: int,
        document_type: DocumentType,
        document_number: int,
        created_at: datetime,
    ) -> Path:
        filename = self.build_export_filename(document_type, document_number, created_at, "docx")
        return self.get_document_dir(order_id, document_id) / filename

    def get_pdf_output_path(
        self,
        order_id: int,
        document_id: int,
        document_type: DocumentType,
        document_number: int,
        created_at: datetime,
    ) -> Path:
        filename = self.build_export_filename(document_type, document_number, created_at, "pdf")
        return self.get_document_dir(order_id, document_id) / filename
