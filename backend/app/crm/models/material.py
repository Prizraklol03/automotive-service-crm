from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmMaterial(TimestampMixin, Base):
    __tablename__ = "crm_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    row_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    service_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_service_categories.id", ondelete="SET NULL"),
        nullable=True,
    )

    service_category = relationship("CrmServiceCategory")
    attachments = relationship(
        "CrmMaterialAttachment",
        back_populates="material",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
