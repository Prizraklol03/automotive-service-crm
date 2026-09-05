from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmCarBrand(TimestampMixin, Base):
    __tablename__ = "crm_car_brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    normalized_name: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    source_name: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_brand_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    models = relationship("CrmCarModel", back_populates="brand")
    vehicles = relationship("CrmVehicle", back_populates="brand_ref")
