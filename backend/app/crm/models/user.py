from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmUser(TimestampMixin, Base):
    __tablename__ = "crm_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("crm_roles.id", ondelete="RESTRICT"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    login: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    token_version: Mapped[int] = mapped_column(nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    role = relationship("CrmRole", back_populates="users")
    created_documents = relationship("CrmDocument", back_populates="created_by")
    audit_logs = relationship("CrmAuditLog", back_populates="actor_user")
    sessions = relationship("CrmUserSession", back_populates="user")
    permissions = relationship(
        "CrmUserPermission",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="CrmUserPermission.user_id",
    )
    preferences = relationship("CrmUserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")
