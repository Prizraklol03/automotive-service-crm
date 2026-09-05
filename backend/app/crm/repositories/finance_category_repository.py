from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.finance_category import CrmFinanceCategory
from app.crm.models.finance_expense import CrmFinanceExpense


class FinanceCategoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, category: CrmFinanceCategory) -> CrmFinanceCategory:
        self.session.add(category)
        self.session.flush()
        return category

    def get_by_id(self, category_id: int) -> CrmFinanceCategory | None:
        statement = select(CrmFinanceCategory).where(CrmFinanceCategory.id == category_id)
        return self.session.scalar(statement)

    def get_by_name(self, name: str) -> CrmFinanceCategory | None:
        statement = select(CrmFinanceCategory).where(CrmFinanceCategory.name == name.strip())
        return self.session.scalar(statement)

    def list_all(self) -> list[CrmFinanceCategory]:
        statement = select(CrmFinanceCategory).order_by(CrmFinanceCategory.name.asc(), CrmFinanceCategory.id.asc())
        return list(self.session.scalars(statement))

    def has_expenses(self, category_id: int) -> bool:
        statement = select(CrmFinanceExpense.id).where(CrmFinanceExpense.category_id == category_id).limit(1)
        return self.session.scalar(statement) is not None

    def delete(self, category: CrmFinanceCategory) -> None:
        self.session.delete(category)
        self.session.flush()
