import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.encrypted_types import EncryptedText
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.crm.models.custom_field import OrderFieldValue
    from app.crm.models.inspection import CrmInspectionSession
    from app.crm.models.order_payment import CrmOrderPayment
    from app.crm.models.order_status import CrmOrderStatus


# Сохраняем enum для обратной совместимости при парсинге audit-логов.
# Новый код не использует его для хранения — колонка status теперь VARCHAR FK.
class OrderStatus(str, enum.Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class CrmOrder(TimestampMixin, Base):
    __tablename__ = "crm_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("crm_clients.id", ondelete="RESTRICT"), nullable=False)
    payer_client_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_clients.id", ondelete="RESTRICT"),
        nullable=True,
    )
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("crm_vehicles.id", ondelete="RESTRICT"), nullable=False)

    # status хранит code из crm_order_statuses (VARCHAR FK).
    # Значение — строка, напр. "draft", "in_progress", "drying".
    status: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("crm_order_statuses.code", ondelete="RESTRICT"),
        nullable=False,
        default="new",
    )
    status_record: Mapped["CrmOrderStatus"] = relationship(
        "CrmOrderStatus",
        foreign_keys=[status],
        back_populates="orders",
        lazy="select",
    )

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    handover_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    comment: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    discount_type: Mapped[str] = mapped_column(String(8), nullable=False, default="fixed")
    services_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    amount_to_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    photo_share_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    photo_share_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    photo_share_revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    client = relationship("CrmClient", back_populates="orders", foreign_keys=[client_id])
    payer_client = relationship("CrmClient", foreign_keys=[payer_client_id], back_populates="payer_orders")
    vehicle = relationship("CrmVehicle", back_populates="orders")
    services = relationship("CrmOrderService", back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list["CrmOrderPayment"]] = relationship(
        "CrmOrderPayment",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="CrmOrderPayment.payment_date.desc(), CrmOrderPayment.created_at.desc(), CrmOrderPayment.id.desc()",
    )
    documents = relationship("CrmDocument", back_populates="order")
    photos = relationship(
        "CrmOrderPhoto",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="CrmOrderPhoto.sort_order",
    )
    field_values: Mapped[list["OrderFieldValue"]] = relationship(
        "OrderFieldValue", back_populates="order", cascade="all, delete-orphan"
    )
    inspection_sessions: Mapped[list["CrmInspectionSession"]] = relationship(
        "CrmInspectionSession",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="CrmInspectionSession.created_at.desc(), CrmInspectionSession.id.desc()",
    )
