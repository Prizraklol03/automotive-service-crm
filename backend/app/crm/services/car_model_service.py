from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.car_model import CrmCarModel
from app.crm.repositories.car_brand_repository import CarBrandRepository
from app.crm.repositories.car_model_repository import CarModelRepository
from app.crm.schemas.reference_catalog import CarModelCreate
from app.crm.utils.normalization import canonicalize_reference_name, normalize_reference_lookup_key


class CarModelService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.brands = CarBrandRepository(session)
        self.repository = CarModelRepository(session)

    def create(self, payload: CarModelCreate) -> CrmCarModel:
        if not self.brands.get_by_id(payload.brand_id):
            raise AppError(code="not_found", message="Марка автомобиля не найдена", status_code=404)

        canonical_name = canonicalize_reference_name(payload.name)
        normalized_name = normalize_reference_lookup_key(canonical_name, entity="model")
        existing = self.repository.get_by_brand_and_normalized_name(payload.brand_id, normalized_name)
        if existing:
            raise AppError(code="conflict", message="Модель автомобиля уже существует в этой марке", status_code=409)

        model = CrmCarModel(
            brand_id=payload.brand_id,
            name=canonical_name,
            normalized_name=normalized_name,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
        try:
            self.repository.create(model)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Модель автомобиля уже существует в этой марке", status_code=409) from exc
        return self.get(model.id)

    def list_all(self) -> list[CrmCarModel]:
        return self.repository.list_all()

    def list_by_brand(self, brand_id: int) -> list[CrmCarModel]:
        if not self.brands.get_by_id(brand_id):
            raise AppError(code="not_found", message="Марка автомобиля не найдена", status_code=404)
        return self.repository.list_by_brand(brand_id)

    def get(self, model_id: int) -> CrmCarModel:
        model = self.repository.get_by_id(model_id)
        if not model:
            raise AppError(code="not_found", message="Модель автомобиля не найдена", status_code=404)
        return model

    def update(self, model_id: int, payload: CarModelCreate) -> CrmCarModel:
        model = self.get(model_id)
        if not self.brands.get_by_id(payload.brand_id):
            raise AppError(code="not_found", message="Марка автомобиля не найдена", status_code=404)
        canonical_name = canonicalize_reference_name(payload.name)
        normalized_name = normalize_reference_lookup_key(canonical_name, entity="model")
        existing = self.repository.get_by_brand_and_normalized_name(payload.brand_id, normalized_name)
        if existing and existing.id != model_id:
            raise AppError(code="conflict", message="Модель автомобиля уже существует в этой марке", status_code=409)
        model.brand_id = payload.brand_id
        model.name = canonical_name
        model.normalized_name = normalized_name
        model.sort_order = payload.sort_order
        model.is_active = payload.is_active
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Модель автомобиля уже существует в этой марке", status_code=409) from exc
        return self.get(model_id)
