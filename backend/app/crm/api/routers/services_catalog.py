from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_permission
from app.crm.schemas.service_catalog import ServiceCatalogCreate, ServiceCatalogRead, ServiceCatalogReorderRequest
from app.crm.services.service_catalog_service import ServiceCatalogService

router = APIRouter()


@router.post("", response_model=ServiceCatalogRead, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCatalogCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.catalog.manage")),
) -> ServiceCatalogRead:
    return ServiceCatalogService(db).create(payload)


@router.get("", response_model=list[ServiceCatalogRead])
def list_services(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[ServiceCatalogRead]:
    return ServiceCatalogService(db).list_all()


@router.put("/reorder", response_model=list[ServiceCatalogRead])
def reorder_services(
    payload: ServiceCatalogReorderRequest,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.catalog.manage")),
) -> list[ServiceCatalogRead]:
    return ServiceCatalogService(db).reorder(payload)


@router.get("/by-category/{category_id}", response_model=list[ServiceCatalogRead])
def list_services_by_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[ServiceCatalogRead]:
    return ServiceCatalogService(db).list_by_category(category_id)


@router.get("/{service_id}", response_model=ServiceCatalogRead)
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> ServiceCatalogRead:
    return ServiceCatalogService(db).get(service_id)


@router.put("/{service_id}", response_model=ServiceCatalogRead)
def update_service(
    service_id: int,
    payload: ServiceCatalogCreate,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.catalog.manage")),
) -> ServiceCatalogRead:
    return ServiceCatalogService(db).update(service_id, payload)
