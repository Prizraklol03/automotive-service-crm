from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class MaterialCreate(CrmSchema):
    material_name: str = Field(min_length=1, max_length=255)
    unit_price: Decimal = Field(ge=1)
    quantity: int = Field(ge=1)
    service_category_id: int | None = None
    expense_date: date


class MaterialRead(CrmSchema):
    id: int
    material_name: str
    unit_price: Decimal
    quantity: int
    row_total: Decimal
    service_category_id: int | None
    service_category_name: str | None = None
    expense_date: date
    attachments_count: int = 0


class MaterialCategorySummaryRead(CrmSchema):
    category_id: int | None
    name: str
    amount: Decimal
    rows: int


class MaterialListSummaryRead(CrmSchema):
    total_amount: Decimal
    categories: list[MaterialCategorySummaryRead] = Field(default_factory=list)
