from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.service_catalog import CrmServiceCatalog
from app.crm.models.service_category import CrmServiceCategory


class ServiceCatalogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, service: CrmServiceCatalog) -> CrmServiceCatalog:
        self.session.add(service)
        self.session.flush()
        return service

    def get_by_id(self, service_id: int) -> CrmServiceCatalog | None:
        statement = select(CrmServiceCatalog).options(selectinload(CrmServiceCatalog.category)).where(CrmServiceCatalog.id == service_id)
        return self.session.scalar(statement)

    def get_by_category_and_name(self, category_id: int, name: str) -> CrmServiceCatalog | None:
        return self.session.scalar(
            select(CrmServiceCatalog).where(CrmServiceCatalog.category_id == category_id, CrmServiceCatalog.name == name)
        )

    def get_max_sort_order(self, category_id: int) -> int:
        statement = (
            select(CrmServiceCatalog.sort_order)
            .where(CrmServiceCatalog.category_id == category_id)
            .order_by(CrmServiceCatalog.sort_order.desc(), CrmServiceCatalog.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement) or 0

    def list_all(self) -> list[CrmServiceCatalog]:
        statement = (
            select(CrmServiceCatalog)
            .join(CrmServiceCatalog.category)
            .options(selectinload(CrmServiceCatalog.category))
            .order_by(
                CrmServiceCategory.sort_order.asc(),
                CrmServiceCategory.id.asc(),
                CrmServiceCatalog.sort_order.asc(),
                CrmServiceCatalog.id.asc(),
            )
        )
        return list(self.session.scalars(statement))

    def list_by_category(self, category_id: int) -> list[CrmServiceCatalog]:
        statement = (
            select(CrmServiceCatalog)
            .options(selectinload(CrmServiceCatalog.category))
            .where(CrmServiceCatalog.category_id == category_id)
            .order_by(CrmServiceCatalog.sort_order.asc(), CrmServiceCatalog.id.asc())
        )
        return list(self.session.scalars(statement))
