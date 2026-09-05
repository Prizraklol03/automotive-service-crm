from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CrmOrderService(TimestampMixin, Base):
    __tablename__ = "crm_order_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False)
    service_catalog_id: Mapped[int | None] = mapped_column(ForeignKey("crm_services_catalog.id", ondelete="SET NULL"), nullable=True)
    service_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    category_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    row_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    sort_key: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    order = relationship("CrmOrder", back_populates="services")
    service_catalog = relationship("CrmServiceCatalog", back_populates="order_services")
