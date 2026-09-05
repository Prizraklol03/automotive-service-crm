import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class ReminderTargetType(str, enum.Enum):
    CLIENT = "client"
    ORDER = "order"
    VEHICLE = "vehicle"
    STANDALONE = "standalone"


class ReminderStatus(str, enum.Enum):
    ACTIVE = "active"
    POSTPONED = "postponed"
    DONE = "done"
    EXPIRED = "expired"


class CrmReminder(TimestampMixin, Base):
    __tablename__ = "crm_reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[ReminderTargetType] = mapped_column(
        Enum(
            ReminderTargetType,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
    )
    target_id: Mapped[int] = mapped_column(nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    status: Mapped[ReminderStatus] = mapped_column(
        Enum(
            ReminderStatus,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
        default=ReminderStatus.ACTIVE,
    )
    postpone_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    repeat_rule: Mapped[str | None] = mapped_column(String(255), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)

    created_by = relationship("CrmUser")
