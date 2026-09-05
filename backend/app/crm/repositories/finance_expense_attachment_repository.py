from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.finance_expense_attachment import CrmFinanceExpenseAttachment


class FinanceExpenseAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, attachment: CrmFinanceExpenseAttachment) -> CrmFinanceExpenseAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> CrmFinanceExpenseAttachment | None:
        statement = (
            select(CrmFinanceExpenseAttachment)
            .options(selectinload(CrmFinanceExpenseAttachment.created_by_user))
            .where(CrmFinanceExpenseAttachment.id == attachment_id)
        )
        return self.session.scalar(statement)

    def list_by_expense_id(self, expense_id: int) -> list[CrmFinanceExpenseAttachment]:
        statement = (
            select(CrmFinanceExpenseAttachment)
            .options(selectinload(CrmFinanceExpenseAttachment.created_by_user))
            .where(CrmFinanceExpenseAttachment.expense_id == expense_id)
            .order_by(CrmFinanceExpenseAttachment.created_at.desc(), CrmFinanceExpenseAttachment.id.desc())
        )
        return list(self.session.scalars(statement))

    def delete(self, attachment: CrmFinanceExpenseAttachment) -> None:
        self.session.delete(attachment)
        self.session.flush()
