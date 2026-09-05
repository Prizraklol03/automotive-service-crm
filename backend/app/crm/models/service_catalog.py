from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmServiceCatalog(TimestampMixin, Base):
    __tablename__ = "crm_services_catalog"
    __table_args__ = (UniqueConstraint("category_id", "name", name="uq_crm_services_catalog_category_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("crm_service_categories.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)

    category = relationship("CrmServiceCategory", back_populates="services")
    order_services = relationship("CrmOrderService", back_populates="service_catalog")
