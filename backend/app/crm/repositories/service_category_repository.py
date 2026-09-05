from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.service_category import CrmServiceCategory


class ServiceCategoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, category: CrmServiceCategory) -> CrmServiceCategory:
        self.session.add(category)
        self.session.flush()
        return category

    def get_by_id(self, category_id: int) -> CrmServiceCategory | None:
        return self.session.get(CrmServiceCategory, category_id)

    def get_by_name(self, name: str) -> CrmServiceCategory | None:
        return self.session.scalar(select(CrmServiceCategory).where(CrmServiceCategory.name == name))

    def list_all(self) -> list[CrmServiceCategory]:
        return list(self.session.scalars(select(CrmServiceCategory).order_by(CrmServiceCategory.sort_order.asc(), CrmServiceCategory.id.asc())))
