from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmUserPermission(TimestampMixin, Base):
    __tablename__ = "crm_user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "permission_code", name="uq_crm_user_permissions_user_id_permission_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_code: Mapped[str] = mapped_column(String(64), nullable=False)
    is_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    user = relationship("CrmUser", foreign_keys=[user_id], back_populates="permissions")
    updated_by_user = relationship("CrmUser", foreign_keys=[updated_by_user_id])
