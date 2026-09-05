from __future__ import annotations

import enum
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.encrypted_types import EncryptedText

if TYPE_CHECKING:
    from app.crm.models.order import CrmOrder


class FieldType(str, enum.Enum):
    TEXT = "text"
    NUMBER = "number"
    SELECT = "select"
    CHECKBOX = "checkbox"
    DATE = "date"


class CustomFieldDef(Base):
    __tablename__ = "crm_custom_field_defs"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False, default=FieldType.TEXT.value)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    placeholder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    options: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)  # for select type

    values: Mapped[list["OrderFieldValue"]] = relationship(
        "OrderFieldValue", back_populates="field_def", cascade="all, delete-orphan"
    )

    @property
    def type(self) -> FieldType:
        return FieldType(self.field_type)


class OrderFieldValue(Base):
    __tablename__ = "crm_order_field_values"

    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("crm_orders.id", ondelete="CASCADE"), primary_key=True
    )
    field_key: Mapped[str] = mapped_column(
        String(64), ForeignKey("crm_custom_field_defs.key", ondelete="CASCADE"), primary_key=True
    )
    value: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)

    order: Mapped["CrmOrder"] = relationship("CrmOrder", back_populates="field_values")
    field_def: Mapped["CustomFieldDef"] = relationship("CustomFieldDef", back_populates="values")
