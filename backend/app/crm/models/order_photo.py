from __future__ import annotations

import enum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class PhotoStage(str, enum.Enum):
    INSPECTION = "inspection"
    BEFORE = "before"
    PROCESS = "process"
    AFTER = "after"


class CrmOrderPhoto(TimestampMixin, Base):
    __tablename__ = "crm_order_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[PhotoStage] = mapped_column(
        Enum(
            PhotoStage,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    thumb_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    order = relationship("CrmOrder", back_populates="photos")
