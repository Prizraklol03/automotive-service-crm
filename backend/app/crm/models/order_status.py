from __future__ import annotations

import enum

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class StatusGroup(str, enum.Enum):
    NEW = "new"              # создан, не начат
    IN_PROGRESS = "in_progress"  # любой этап работы
    DONE = "done"            # работа закончена, не выдан
    CLOSED = "closed"        # выдан клиенту, выручка зафиксирована
    CANCELLED = "cancelled"  # отменён


# Группы, при которых заказ считается архивным (скрыт из основного списка)
ARCHIVED_GROUPS: frozenset[StatusGroup] = frozenset({StatusGroup.CLOSED, StatusGroup.CANCELLED})

# Группы, при которых заказ считается активным
ACTIVE_GROUPS: frozenset[StatusGroup] = frozenset({StatusGroup.NEW, StatusGroup.IN_PROGRESS, StatusGroup.DONE})


class CrmOrderStatus(Base):
    __tablename__ = "crm_order_statuses"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status_group: Mapped[str] = mapped_column(String(32), nullable=False)
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="#6b7280")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    orders: Mapped[list["CrmOrder"]] = relationship(  # type: ignore[name-defined]
        "CrmOrder", back_populates="status_record", foreign_keys="CrmOrder.status"
    )

    @property
    def group(self) -> StatusGroup:
        return StatusGroup(self.status_group)

    def __repr__(self) -> str:
        return f"<CrmOrderStatus code={self.code!r} group={self.status_group!r}>"
