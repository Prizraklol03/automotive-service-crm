from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.document_template import CrmDocumentTemplate, DocumentType


class DocumentTemplateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, template: CrmDocumentTemplate) -> CrmDocumentTemplate:
        self.session.add(template)
        self.session.flush()
        return template

    def get_by_id(self, template_id: int) -> CrmDocumentTemplate | None:
        return self.session.get(CrmDocumentTemplate, template_id)

    def get_by_code(self, code: DocumentType) -> CrmDocumentTemplate | None:
        return self.session.scalar(select(CrmDocumentTemplate).where(CrmDocumentTemplate.code == code))

    def list_all(self) -> list[CrmDocumentTemplate]:
        return list(self.session.scalars(select(CrmDocumentTemplate).order_by(CrmDocumentTemplate.code.asc())))
