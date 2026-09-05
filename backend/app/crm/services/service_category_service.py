from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.service_category import CrmServiceCategory
from app.crm.repositories.service_category_repository import ServiceCategoryRepository
from app.crm.schemas.service_category import ServiceCategoryCreate, ServiceCategoryReorderRequest


class ServiceCategoryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = ServiceCategoryRepository(session)

    def create(self, payload: ServiceCategoryCreate) -> CrmServiceCategory:
        category = CrmServiceCategory(
            color=self._normalize_color(payload.color),
            name=payload.name.strip(),
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
        try:
            self.repository.create(category)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Категория услуг уже существует", status_code=409) from exc
        return self.get(category.id)

    def list_all(self) -> list[CrmServiceCategory]:
        return self.repository.list_all()

    def get(self, category_id: int) -> CrmServiceCategory:
        category = self.repository.get_by_id(category_id)
        if not category:
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)
        return category

    def update(self, category_id: int, payload: ServiceCategoryCreate) -> CrmServiceCategory:
        category = self.get(category_id)
        category.color = self._normalize_color(payload.color)
        category.name = payload.name.strip()
        category.sort_order = payload.sort_order
        category.is_active = payload.is_active
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Категория услуг уже существует", status_code=409) from exc
        return self.get(category_id)

    def reorder(self, payload: ServiceCategoryReorderRequest) -> list[CrmServiceCategory]:
        categories = self.repository.list_all()
        categories_by_id = {category.id: category for category in categories}
        request_ids = [item.id for item in payload.items]
        expected_ids = set(categories_by_id)

        if len(request_ids) != len(set(request_ids)) or set(request_ids) != expected_ids:
            raise AppError(
                code="validation_error",
                message="Порядок категорий должен содержать все существующие категории без дублей",
                status_code=422,
                details={"field": "items"},
            )

        for item in payload.items:
            categories_by_id[item.id].sort_order = item.sort_order

        self.session.commit()
        return self.repository.list_all()

    @staticmethod
    def _normalize_color(value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 7 or not normalized.startswith("#"):
            raise AppError(
                code="validation_error",
                message="Цвет категории должен быть в формате #RRGGBB",
                status_code=422,
                details={"field": "color"},
            )
        if any(symbol not in "0123456789ABCDEF" for symbol in normalized[1:]):
            raise AppError(
                code="validation_error",
                message="Цвет категории должен быть в формате #RRGGBB",
                status_code=422,
                details={"field": "color"},
            )
        return normalized
