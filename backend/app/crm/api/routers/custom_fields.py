from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_roles
from app.crm.schemas.custom_field import (
    CustomFieldDefCreatePayload,
    CustomFieldDefRead,
    CustomFieldReorderPayload,
    CustomFieldDefUpdatePayload,
    OrderFieldValueRead,
    OrderFieldValuesPayload,
)
from app.crm.services.custom_field_service import CustomFieldService

# Registered under /settings prefix
settings_router = APIRouter()

# Registered at root (no prefix) alongside /orders routes
order_router = APIRouter()


# -- Custom Field Definitions (admin) under /settings/custom-fields -----------

@settings_router.get("/custom-fields", response_model=list[CustomFieldDefRead])
def list_custom_fields(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[CustomFieldDefRead]:
    svc = CustomFieldService(db)
    return [svc.to_def_read(d) for d in svc.list_defs()]


@settings_router.post("/custom-fields", response_model=CustomFieldDefRead, status_code=status.HTTP_201_CREATED)
def create_custom_field(
    payload: CustomFieldDefCreatePayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> CustomFieldDefRead:
    svc = CustomFieldService(db)
    return svc.to_def_read(svc.create_def(payload))


@settings_router.post("/custom-fields/reorder", response_model=list[CustomFieldDefRead])
def reorder_custom_fields(
    payload: CustomFieldReorderPayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> list[CustomFieldDefRead]:
    svc = CustomFieldService(db)
    return [svc.to_def_read(d) for d in svc.reorder_defs(payload.keys)]


@settings_router.patch("/custom-fields/{key}", response_model=CustomFieldDefRead)
def update_custom_field(
    key: str,
    payload: CustomFieldDefUpdatePayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> CustomFieldDefRead:
    svc = CustomFieldService(db)
    return svc.to_def_read(svc.update_def(key, payload))


@settings_router.delete("/custom-fields/{key}")
def delete_custom_field(
    key: str,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> Response:
    CustomFieldService(db).delete_def(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Order Field Values (per order) under /orders/{order_id}/field-values -----

@order_router.get("/orders/{order_id}/field-values", response_model=list[OrderFieldValueRead])
def get_order_field_values(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[OrderFieldValueRead]:
    return CustomFieldService(db).get_order_field_values(order_id)


@order_router.put("/orders/{order_id}/field-values", response_model=list[OrderFieldValueRead])
def upsert_order_field_values(
    order_id: int,
    payload: OrderFieldValuesPayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[OrderFieldValueRead]:
    return CustomFieldService(db).upsert_order_field_values(order_id, payload)
