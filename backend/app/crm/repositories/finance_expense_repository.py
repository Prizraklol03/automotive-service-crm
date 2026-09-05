from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.finance_expense import CrmFinanceExpense
from app.crm.repositories.query_utils import paginate_scalars


class FinanceExpenseRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, expense: CrmFinanceExpense) -> CrmFinanceExpense:
        self.session.add(expense)
        self.session.flush()
        return expense

    def get_by_id(self, expense_id: int) -> CrmFinanceExpense | None:
        statement = (
            select(CrmFinanceExpense)
            .options(
                selectinload(CrmFinanceExpense.category),
                selectinload(CrmFinanceExpense.created_by_user),
            )
            .where(CrmFinanceExpense.id == expense_id)
        )
        return self.session.scalar(statement)

    def list_in_period(self, *, date_from: date | None = None, date_to: date | None = None) -> list[CrmFinanceExpense]:
        statement = select(CrmFinanceExpense).options(
            selectinload(CrmFinanceExpense.category),
            selectinload(CrmFinanceExpense.created_by_user),
        )
        if date_from is not None:
            statement = statement.where(CrmFinanceExpense.expense_date >= date_from)
        if date_to is not None:
            statement = statement.where(CrmFinanceExpense.expense_date <= date_to)
        statement = statement.order_by(
            CrmFinanceExpense.expense_date.desc(),
            CrmFinanceExpense.created_at.desc(),
            CrmFinanceExpense.id.desc(),
        )
        return list(self.session.scalars(statement))

    def list_page(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmFinanceExpense], int, int, int]:
        statement = select(CrmFinanceExpense).options(
            selectinload(CrmFinanceExpense.category),
            selectinload(CrmFinanceExpense.created_by_user),
        )
        if date_from is not None:
            statement = statement.where(CrmFinanceExpense.expense_date >= date_from)
        if date_to is not None:
            statement = statement.where(CrmFinanceExpense.expense_date <= date_to)

        sort_key = (sort_by or "expense_date").strip()
        sort_direction = (sort_dir or "desc").strip().lower()
        if sort_key == "amount":
            sort_column = CrmFinanceExpense.amount
        elif sort_key == "category_name":
            sort_column = CrmFinanceExpense.category_id
        elif sort_key == "created_by_user_name":
            sort_column = CrmFinanceExpense.created_by_user_id
        elif sort_key == "id":
            sort_column = CrmFinanceExpense.id
        else:
            sort_column = CrmFinanceExpense.expense_date

        order_by = sort_column.desc() if sort_direction == "desc" else sort_column.asc()
        statement = statement.order_by(order_by, CrmFinanceExpense.created_at.desc(), CrmFinanceExpense.id.desc())
        return paginate_scalars(self.session, statement, page=page, page_size=page_size)

    def get_total_in_period(self, *, date_from: date | None = None, date_to: date | None = None) -> Decimal:
        statement = select(func.coalesce(func.sum(CrmFinanceExpense.amount), 0))
        if date_from is not None:
            statement = statement.where(CrmFinanceExpense.expense_date >= date_from)
        if date_to is not None:
            statement = statement.where(CrmFinanceExpense.expense_date <= date_to)
        total = self.session.scalar(statement)
        return Decimal(total or 0).quantize(Decimal("0.01"))

    def delete(self, expense: CrmFinanceExpense) -> None:
        self.session.delete(expense)
        self.session.flush()
