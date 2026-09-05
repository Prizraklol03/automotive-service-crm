from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmCarModel(TimestampMixin, Base):
    __tablename__ = "crm_car_models"
    __table_args__ = (UniqueConstraint("brand_id", "name", name="uq_crm_car_models_brand_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = mapped_column(ForeignKey("crm_car_brands.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    normalized_name: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    source_name: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_model_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    brand = relationship("CrmCarBrand", back_populates="models")
    vehicles = relationship("CrmVehicle", back_populates="model_ref")
