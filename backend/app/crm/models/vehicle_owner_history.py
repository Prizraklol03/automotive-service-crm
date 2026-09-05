from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmVehicleOwnerHistory(TimestampMixin, Base):
    __tablename__ = "crm_vehicle_owner_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("crm_vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("crm_clients.id", ondelete="RESTRICT"), nullable=False)
    owned_from: Mapped[date] = mapped_column(Date, nullable=False)
    owned_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    vehicle = relationship("CrmVehicle", back_populates="owner_history")
    client = relationship("CrmClient")
