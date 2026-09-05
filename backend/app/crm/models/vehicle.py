from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.encrypted_types import EncryptedText
from app.db.base import Base, TimestampMixin


class CrmVehicle(TimestampMixin, Base):
    __tablename__ = "crm_vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("crm_clients.id", ondelete="RESTRICT"), nullable=False)
    plate_number_display: Mapped[str] = mapped_column(EncryptedText(), nullable=False)
    plate_number_normalized: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    plate_search_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    plate_fragment_hashes: Mapped[list[str]] = mapped_column(ARRAY(String(64)), nullable=False, default=list)
    vin: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    vin_search_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    body_number: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("crm_car_brands.id", ondelete="RESTRICT"), nullable=True)
    model_id: Mapped[int | None] = mapped_column(ForeignKey("crm_car_models.id", ondelete="RESTRICT"), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    color: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comment: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    client = relationship("CrmClient", back_populates="vehicles")
    brand_ref = relationship("CrmCarBrand", back_populates="vehicles")
    model_ref = relationship("CrmCarModel", back_populates="vehicles")
    orders = relationship("CrmOrder", back_populates="vehicle")
    inspection_sessions = relationship("CrmInspectionSession", back_populates="vehicle")
    owner_history = relationship(
        "CrmVehicleOwnerHistory",
        back_populates="vehicle",
        cascade="all, delete-orphan",
        order_by="CrmVehicleOwnerHistory.owned_from.desc(), CrmVehicleOwnerHistory.id.desc()",
    )
