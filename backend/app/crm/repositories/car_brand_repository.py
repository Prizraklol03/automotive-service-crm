from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.crm.models.car_brand import CrmCarBrand


class CarBrandRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, brand: CrmCarBrand) -> CrmCarBrand:
        self.session.add(brand)
        self.session.flush()
        return brand

    def get_by_id(self, brand_id: int) -> CrmCarBrand | None:
        return self.session.get(CrmCarBrand, brand_id)

    def get_by_name(self, name: str) -> CrmCarBrand | None:
        return self.session.scalar(select(CrmCarBrand).where(CrmCarBrand.name == name))

    def get_by_normalized_name(self, normalized_name: str) -> CrmCarBrand | None:
        return self.session.scalar(select(CrmCarBrand).where(CrmCarBrand.normalized_name == normalized_name))

    def get_by_source_identifier(self, source_name: str, source_brand_id: str) -> CrmCarBrand | None:
        return self.session.scalar(
            select(CrmCarBrand).where(
                CrmCarBrand.source_name == source_name,
                CrmCarBrand.source_brand_id == source_brand_id,
            )
        )

    def list_all(self) -> list[CrmCarBrand]:
        statement = select(CrmCarBrand).order_by(CrmCarBrand.sort_order.asc(), CrmCarBrand.name.asc(), CrmCarBrand.id.asc())
        return list(self.session.scalars(statement))

    def count_all(self) -> int:
        return int(self.session.scalar(select(func.count()).select_from(CrmCarBrand)) or 0)
