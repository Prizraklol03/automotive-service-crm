from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.encrypted_types import EncryptedText


class CrmNote(TimestampMixin, Base):
    __tablename__ = "crm_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    comment: Mapped[str] = mapped_column(EncryptedText(), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)
    telephone: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)

    created_by = relationship("CrmUser")
