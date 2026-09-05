from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_roles
from app.crm.schemas.reference_catalog import CarBrandCreate, CarBrandRead
from app.crm.services.car_brand_service import CarBrandService
from app.crm.services.vehicle_catalog_alias_service import build_car_brand_read

router = APIRouter()


@router.get("", response_model=list[CarBrandRead])
def list_car_brands(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[CarBrandRead]:
    return [build_car_brand_read(item) for item in CarBrandService(db).list_all()]


@router.post("", response_model=CarBrandRead, status_code=status.HTTP_201_CREATED)
def create_car_brand(
    payload: CarBrandCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> CarBrandRead:
    return build_car_brand_read(CarBrandService(db).create(payload))


@router.get("/{brand_id}", response_model=CarBrandRead)
def get_car_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> CarBrandRead:
    return build_car_brand_read(CarBrandService(db).get(brand_id))


@router.put("/{brand_id}", response_model=CarBrandRead)
def update_car_brand(
    brand_id: int,
    payload: CarBrandCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> CarBrandRead:
    return build_car_brand_read(CarBrandService(db).update(brand_id, payload))
