from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_roles
from app.crm.schemas.reference_catalog import CarModelCreate, CarModelRead
from app.crm.services.car_model_service import CarModelService
from app.crm.services.vehicle_catalog_alias_service import build_car_model_read

router = APIRouter()


@router.get("", response_model=list[CarModelRead])
def list_car_models(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[CarModelRead]:
    return [build_car_model_read(item) for item in CarModelService(db).list_all()]


@router.post("", response_model=CarModelRead, status_code=status.HTTP_201_CREATED)
def create_car_model(
    payload: CarModelCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> CarModelRead:
    return build_car_model_read(CarModelService(db).create(payload))


@router.get("/by-brand/{brand_id}", response_model=list[CarModelRead])
def list_car_models_by_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[CarModelRead]:
    return [build_car_model_read(item) for item in CarModelService(db).list_by_brand(brand_id)]


@router.get("/{model_id}", response_model=CarModelRead)
def get_car_model(
    model_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> CarModelRead:
    return build_car_model_read(CarModelService(db).get(model_id))


@router.put("/{model_id}", response_model=CarModelRead)
def update_car_model(
    model_id: int,
    payload: CarModelCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> CarModelRead:
    return build_car_model_read(CarModelService(db).update(model_id, payload))
