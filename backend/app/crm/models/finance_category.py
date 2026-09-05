from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmFinanceCategory(TimestampMixin, Base):
    __tablename__ = "crm_finance_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)

    expenses = relationship("CrmFinanceExpense", back_populates="category")
