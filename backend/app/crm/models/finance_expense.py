from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmFinanceExpense(TimestampMixin, Base):
    __tablename__ = "crm_finance_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("crm_finance_categories.id", ondelete="RESTRICT"), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("crm_users.id", ondelete="SET NULL"), nullable=True)

    category = relationship("CrmFinanceCategory", back_populates="expenses")
    attachments = relationship(
        "CrmFinanceExpenseAttachment",
        back_populates="expense",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    created_by_user = relationship("CrmUser")
