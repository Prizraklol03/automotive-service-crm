from __future__ import annotations

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class CustomFieldDefRead(CrmSchema):
    key: str
    label: str
    field_type: str
    is_required: bool
    sort_order: int
    placeholder: str | None
    options: list[str] | None


class CustomFieldDefCreatePayload(CrmSchema):
    label: str = Field(min_length=1, max_length=255)
    field_type: str = "text"
    is_required: bool = False
    sort_order: int = 0
    placeholder: str | None = None
    options: list[str] | None = None


class CustomFieldDefUpdatePayload(CrmSchema):
    label: str = Field(min_length=1, max_length=255)
    field_type: str
    is_required: bool
    sort_order: int
    placeholder: str | None = None
    options: list[str] | None = None


class OrderFieldValueRead(CrmSchema):
    field_key: str
    value: str | None
    label: str
    field_type: str
    is_required: bool
    placeholder: str | None = None
    options: list[str] | None = None
    sort_order: int


class OrderFieldValuesPayload(CrmSchema):
    """Map of field_key -> value (string or null)."""
    values: dict[str, str | None]


class CustomFieldReorderPayload(CrmSchema):
    keys: list[str]
