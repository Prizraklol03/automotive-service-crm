from __future__ import annotations

import zipfile
from io import BytesIO
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.document_template import CrmDocumentTemplate, DocumentType
from app.crm.repositories.document_template_repository import DocumentTemplateRepository
from app.crm.services.document_storage_service import DocumentStorageService


class DocumentTemplateService:
    TEMPLATE_META = {
        DocumentType.PRELIMINARY_WORK_ORDER: {
            "display_name": "Предварительный заказ-наряд",
            "file_name": "ПредварительныйЗаказНаряд шаблон.docx",
        },
        DocumentType.WORK_ORDER: {
            "display_name": "Рабочий заказ-наряд",
            "file_name": "Рабочий заказ-наряд шаблон.docx",
        },
        DocumentType.COMPLETION_ACT: {
            "display_name": "Заказ-наряд",
            "file_name": "Заказ наряд шаблон.docx",
        },
        DocumentType.INSPECTION_ACT: {
            "display_name": "Акт приёма-передачи автомобиля",
            "file_name": "Акт приёма передачи авто шаблон.docx",
        },
    }

    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = DocumentTemplateRepository(session)
        self.storage = DocumentStorageService()

    def ensure_default_templates(self) -> None:
        changed = False
        for document_type, meta in self.TEMPLATE_META.items():
            template = self.repository.get_by_code(document_type)
            template_path = self.storage.get_template_path(document_type)
            if template is None:
                self.repository.create(
                    CrmDocumentTemplate(
                        code=document_type,
                        name=meta["display_name"],
                        storage_path=str(template_path),
                        is_active=True,
                    )
                )
                changed = True
                continue

            next_path = str(template_path)
            if template.storage_path != next_path:
                template.storage_path = next_path
                changed = True
            if template.name != meta["display_name"]:
                template.name = meta["display_name"]
                changed = True
            if not template.is_active:
                template.is_active = True
                changed = True

        if changed:
            self.session.commit()

    def list_all(self) -> list[CrmDocumentTemplate]:
        self.ensure_default_templates()
        return self.repository.list_all()

    def get_by_type(self, document_type: DocumentType) -> CrmDocumentTemplate:
        self.ensure_default_templates()
        template = self.repository.get_by_code(document_type)
        if template is None:
            raise FileNotFoundError(f"Template record is missing for {document_type.value}")
        return template

    def get_template_path(self, document_type: DocumentType) -> Path:
        self.ensure_default_templates()
        template = self.get_by_type(document_type)
        path = Path(template.storage_path)
        if not path.exists():
            raise FileNotFoundError(f"Template file not found: {path}")
        return path

    def replace_template(self, document_type: DocumentType, filename: str | None, content: bytes) -> CrmDocumentTemplate:
        self.ensure_default_templates()
        if not filename or not filename.lower().endswith(".docx"):
            raise AppError(
                code="validation_error",
                message="Шаблон документа должен быть в формате DOCX",
                status_code=422,
            )
        if not content:
            raise AppError(
                code="validation_error",
                message="Файл шаблона пустой",
                status_code=422,
            )
        if not zipfile.is_zipfile(BytesIO(content)):
            raise AppError(
                code="validation_error",
                message="Загруженный файл не является корректным DOCX",
                status_code=422,
            )

        template = self.get_by_type(document_type)
        saved_path = self.storage.replace_template_file(document_type, content)
        template.storage_path = str(saved_path)
        template.name = self.TEMPLATE_META[document_type]["display_name"]
        template.is_active = True
        self.session.commit()
        self.session.refresh(template)
        return template
