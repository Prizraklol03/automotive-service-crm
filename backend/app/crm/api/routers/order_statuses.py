from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user
from app.crm.schemas.order_status import (
    OrderStatusCreatePayload,
    OrderStatusRead,
    OrderStatusReorderPayload,
    OrderStatusUpdatePayload,
)
from app.crm.services.order_status_config_service import OrderStatusConfigService

router = APIRouter()


@router.get("/statuses", response_model=list[OrderStatusRead])
def list_statuses(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[OrderStatusRead]:
    svc = OrderStatusConfigService(db)
    return [svc.to_read(s) for s in svc.list_all()]


@router.post("/statuses", response_model=OrderStatusRead)
def create_status(
    payload: OrderStatusCreatePayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> OrderStatusRead:
    svc = OrderStatusConfigService(db)
    record = svc.create(payload)
    return svc.to_read(record)


@router.patch("/statuses/{code}", response_model=OrderStatusRead)
def update_status(
    code: str,
    payload: OrderStatusUpdatePayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> OrderStatusRead:
    svc = OrderStatusConfigService(db)
    record = svc.update(code, payload)
    return svc.to_read(record)


@router.delete("/statuses/{code}")
def delete_status(
    code: str,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> dict[str, str]:
    svc = OrderStatusConfigService(db)
    svc.delete(code)
    return {"status": "ok"}


@router.post("/statuses/reorder", response_model=list[OrderStatusRead])
def reorder_statuses(
    payload: OrderStatusReorderPayload,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[OrderStatusRead]:
    svc = OrderStatusConfigService(db)
    records = svc.reorder(payload.codes)
    return [svc.to_read(r) for r in records]
