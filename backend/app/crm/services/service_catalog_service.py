from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.service_catalog import CrmServiceCatalog
from app.crm.repositories.service_catalog_repository import ServiceCatalogRepository
from app.crm.repositories.service_category_repository import ServiceCategoryRepository
from app.crm.schemas.service_catalog import ServiceCatalogCreate, ServiceCatalogReorderRequest


class ServiceCatalogService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.categories = ServiceCategoryRepository(session)
        self.repository = ServiceCatalogRepository(session)

    def create(self, payload: ServiceCatalogCreate) -> CrmServiceCatalog:
        if not self.categories.get_by_id(payload.category_id):
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)

        service = CrmServiceCatalog(
            category_id=payload.category_id,
            name=payload.name.strip(),
            default_price=payload.default_price,
            is_active=payload.is_active,
            sort_order=self.repository.get_max_sort_order(payload.category_id) + 1,
        )
        try:
            self.repository.create(service)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Услуга уже существует в этой категории", status_code=409) from exc
        return self.get(service.id)

    def list_all(self) -> list[CrmServiceCatalog]:
        return self.repository.list_all()

    def get(self, service_id: int) -> CrmServiceCatalog:
        service = self.repository.get_by_id(service_id)
        if not service:
            raise AppError(code="not_found", message="Услуга не найдена", status_code=404)
        return service

    def update(self, service_id: int, payload: ServiceCatalogCreate) -> CrmServiceCatalog:
        service = self.get(service_id)
        if not self.categories.get_by_id(payload.category_id):
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)
        category_changed = service.category_id != payload.category_id
        service.category_id = payload.category_id
        service.name = payload.name.strip()
        service.default_price = payload.default_price
        service.is_active = payload.is_active
        if category_changed:
            service.sort_order = self.repository.get_max_sort_order(payload.category_id) + 1
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Услуга уже существует в этой категории", status_code=409) from exc
        return self.get(service_id)

    def list_by_category(self, category_id: int) -> list[CrmServiceCatalog]:
        if not self.categories.get_by_id(category_id):
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)
        return self.repository.list_by_category(category_id)

    def reorder(self, payload: ServiceCatalogReorderRequest) -> list[CrmServiceCatalog]:
        if not self.categories.get_by_id(payload.category_id):
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)

        services = self.repository.list_by_category(payload.category_id)
        services_by_id = {service.id: service for service in services}
        request_ids = [item.id for item in payload.items]

        if len(set(request_ids)) != len(request_ids):
            raise AppError(code="validation_error", message="Элементы списка не должны повторяться", status_code=400)

        expected_ids = {service.id for service in services}
        if set(request_ids) != expected_ids:
            raise AppError(code="validation_error", message="Список должен содержать все услуги этой категории", status_code=400)

        for item in payload.items:
            services_by_id[item.id].sort_order = item.sort_order

        self.session.commit()
        return self.repository.list_by_category(payload.category_id)
