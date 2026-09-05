from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import app_now_naive
from app.db.base import Base, TimestampMixin


class OrderPaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    TRANSFER = "transfer"
    OTHER = "other"


class CrmOrderPayment(TimestampMixin, Base):
    __tablename__ = "crm_order_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=app_now_naive,
        server_default=func.now(),
        nullable=False,
    )
    payment_method: Mapped[OrderPaymentMethod] = mapped_column(
        Enum(
            OrderPaymentMethod,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    order = relationship("CrmOrder", back_populates="payments")
    created_by_user = relationship("CrmUser")


class CrmOrderPaymentIdempotency(TimestampMixin, Base):
    __tablename__ = "crm_order_payment_idempotency"
    __table_args__ = (UniqueConstraint("order_id", "key_digest", name="uq_order_payment_idempotency_order_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False)
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_order_payments.id", ondelete="SET NULL"),
        nullable=True,
    )
    key_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

    payment: Mapped[CrmOrderPayment | None] = relationship("CrmOrderPayment")
