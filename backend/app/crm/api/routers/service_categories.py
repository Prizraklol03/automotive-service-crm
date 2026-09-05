from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_permission
from app.crm.schemas.service_category import ServiceCategoryCreate, ServiceCategoryRead, ServiceCategoryReorderRequest
from app.crm.services.service_category_service import ServiceCategoryService

router = APIRouter()


@router.post("", response_model=ServiceCategoryRead, status_code=status.HTTP_201_CREATED)
def create_service_category(
    payload: ServiceCategoryCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.catalog.manage")),
) -> ServiceCategoryRead:
    return ServiceCategoryService(db).create(payload)


@router.get("", response_model=list[ServiceCategoryRead])
def list_service_categories(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[ServiceCategoryRead]:
    return ServiceCategoryService(db).list_all()


@router.put("/reorder", response_model=list[ServiceCategoryRead])
def reorder_service_categories(
    payload: ServiceCategoryReorderRequest,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.catalog.manage")),
) -> list[ServiceCategoryRead]:
    return ServiceCategoryService(db).reorder(payload)


@router.get("/{category_id}", response_model=ServiceCategoryRead)
def get_service_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> ServiceCategoryRead:
    return ServiceCategoryService(db).get(category_id)


@router.put("/{category_id}", response_model=ServiceCategoryRead)
def update_service_category(
    category_id: int,
    payload: ServiceCategoryCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.catalog.manage")),
) -> ServiceCategoryRead:
    return ServiceCategoryService(db).update(category_id, payload)
