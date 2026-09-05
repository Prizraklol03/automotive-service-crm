from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmUserPreference(TimestampMixin, Base):
    __tablename__ = "crm_user_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="CASCADE"), primary_key=True)
    order_sorting: Mapped[str] = mapped_column(Text, nullable=False)

    user = relationship("CrmUser", back_populates="preferences")
