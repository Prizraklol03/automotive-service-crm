from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.car_brand import CrmCarBrand
from app.crm.repositories.car_brand_repository import CarBrandRepository
from app.crm.schemas.reference_catalog import CarBrandCreate
from app.crm.utils.normalization import canonicalize_reference_name, normalize_reference_lookup_key


class CarBrandService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = CarBrandRepository(session)

    def create(self, payload: CarBrandCreate) -> CrmCarBrand:
        canonical_name = canonicalize_reference_name(payload.name)
        normalized_name = normalize_reference_lookup_key(canonical_name, entity="brand")
        existing = self.repository.get_by_normalized_name(normalized_name)
        if existing:
            raise AppError(code="conflict", message="Марка автомобиля уже существует", status_code=409)

        brand = CrmCarBrand(
            name=canonical_name,
            normalized_name=normalized_name,
            sort_order=payload.sort_order,
            is_active=payload.is_active,
        )
        try:
            self.repository.create(brand)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Марка автомобиля уже существует", status_code=409) from exc
        return self.get(brand.id)

    def list_all(self) -> list[CrmCarBrand]:
        return self.repository.list_all()

    def get(self, brand_id: int) -> CrmCarBrand:
        brand = self.repository.get_by_id(brand_id)
        if not brand:
            raise AppError(code="not_found", message="Марка автомобиля не найдена", status_code=404)
        return brand

    def update(self, brand_id: int, payload: CarBrandCreate) -> CrmCarBrand:
        brand = self.get(brand_id)
        canonical_name = canonicalize_reference_name(payload.name)
        normalized_name = normalize_reference_lookup_key(canonical_name, entity="brand")
        existing = self.repository.get_by_normalized_name(normalized_name)
        if existing and existing.id != brand_id:
            raise AppError(code="conflict", message="Марка автомобиля уже существует", status_code=409)

        brand.name = canonical_name
        brand.normalized_name = normalized_name
        brand.sort_order = payload.sort_order
        brand.is_active = payload.is_active
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Марка автомобиля уже существует", status_code=409) from exc
        return self.get(brand_id)
