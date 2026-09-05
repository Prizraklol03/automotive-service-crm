from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.order import CrmOrder
from app.crm.models.document import CrmDocument


class DocumentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, document: CrmDocument) -> CrmDocument:
        self.session.add(document)
        self.session.flush()
        return document

    def get_by_id(self, document_id: int) -> CrmDocument | None:
        statement = (
            select(CrmDocument)
            .options(
                selectinload(CrmDocument.order).selectinload(CrmOrder.client),
                selectinload(CrmDocument.order).selectinload(CrmOrder.vehicle),
                selectinload(CrmDocument.order).selectinload(CrmOrder.services),
                selectinload(CrmDocument.template),
                selectinload(CrmDocument.created_by),
            )
            .where(CrmDocument.id == document_id)
        )
        return self.session.scalar(statement)

    def list_by_order(self, order_id: int) -> list[CrmDocument]:
        statement = (
            select(CrmDocument)
            .options(
                selectinload(CrmDocument.order).selectinload(CrmOrder.client),
                selectinload(CrmDocument.order).selectinload(CrmOrder.vehicle),
                selectinload(CrmDocument.order).selectinload(CrmOrder.services),
                selectinload(CrmDocument.template),
                selectinload(CrmDocument.created_by),
            )
            .where(CrmDocument.order_id == order_id)
            .order_by(CrmDocument.created_at.desc(), CrmDocument.id.desc())
        )
        return list(self.session.scalars(statement))

    def get_by_order_and_type(self, order_id: int, document_type: str) -> CrmDocument | None:
        statement = (
            select(CrmDocument)
            .options(selectinload(CrmDocument.template), selectinload(CrmDocument.created_by))
            .where(CrmDocument.order_id == order_id, CrmDocument.document_type == document_type)
        )
        return self.session.scalar(statement)
