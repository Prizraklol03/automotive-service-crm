from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class FinanceCategoryCreate(CrmSchema):
    name: str = Field(min_length=1, max_length=120)


class FinanceCategoryUpdate(CrmSchema):
    name: str = Field(min_length=1, max_length=120)


class FinanceCategoryRead(CrmSchema):
    id: int
    name: str


class FinanceExpenseCreate(CrmSchema):
    expense_date: date
    category_id: int
    comment: str = Field(default="", max_length=1000)
    amount: Decimal = Field(gt=0)


class FinanceExpenseRead(CrmSchema):
    id: int
    expense_date: date
    category_id: int
    category_name: str
    comment: str
    amount: Decimal
    created_by_user_id: int | None = None
    created_by_user_name: str | None = None


class FinanceExpenseSummaryRead(CrmSchema):
    total_amount: Decimal
