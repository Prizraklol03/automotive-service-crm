from datetime import datetime
from typing import Literal

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class ClientCreate(CrmSchema):
    client_type: Literal["individual", "legal"] = "individual"
    full_name: str | None = Field(default=None, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    address: str | None = None
    company_name: str | None = Field(default=None, max_length=255)
    inn: str | None = Field(default=None, max_length=32)
    kpp: str | None = Field(default=None, max_length=32)
    ogrn: str | None = Field(default=None, max_length=32)
    legal_address: str | None = None
    actual_address: str | None = None
    representative_full_name: str | None = Field(default=None, max_length=255)
    representative_position: str | None = Field(default=None, max_length=255)
    representative_basis: str | None = None
    telegram_username: str | None = Field(default=None, max_length=65)
    comment: str | None = None


class ClientRead(CrmSchema):
    id: int
    full_name: str
    client_type: Literal["individual", "legal"]
    phone_display: str
    phone_normalized: str
    address: str | None
    company_name: str | None
    inn: str | None
    kpp: str | None
    ogrn: str | None
    legal_address: str | None
    actual_address: str | None
    representative_full_name: str | None
    representative_position: str | None
    representative_basis: str | None
    telegram_username: str | None
    comment: str | None
    display_label: str
    is_individual: bool
    is_legal: bool
    is_deleted: bool
    deleted_at: datetime | None
