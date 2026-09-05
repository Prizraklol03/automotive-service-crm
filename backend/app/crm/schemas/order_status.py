from __future__ import annotations

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class OrderStatusRead(CrmSchema):
    code: str
    display_name: str
    status_group: str
    color: str
    sort_order: int
    is_default: bool


class OrderStatusCreatePayload(CrmSchema):
    display_name: str = Field(min_length=1, max_length=255)
    status_group: str = Field(min_length=1, max_length=32)
    color: str = Field(default="#6b7280", max_length=32)
    is_default: bool = False
    sort_order: int = 0


class OrderStatusUpdatePayload(CrmSchema):
    display_name: str = Field(min_length=1, max_length=255)
    status_group: str = Field(min_length=1, max_length=32)
    color: str = Field(max_length=32)
    is_default: bool
    sort_order: int


class OrderStatusReorderPayload(CrmSchema):
    """Список кодов в новом порядке — sort_order проставляется по индексу."""
    codes: list[str]
