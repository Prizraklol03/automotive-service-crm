from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.order_payment import OrderPaymentCreate, OrderPaymentRead, OrderPaymentUpdate
from app.crm.services.order_payment_service import CrmOrderPaymentService

router = APIRouter()


@router.get("/orders/{order_id}/payments", response_model=list[OrderPaymentRead])
def list_order_payments(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.view")),
) -> list[OrderPaymentRead]:
    service = CrmOrderPaymentService(db)
    return [OrderPaymentRead.model_validate(item) for item in service.list_by_order(order_id)]


@router.post("/orders/{order_id}/payments", response_model=OrderPaymentRead, status_code=status.HTTP_201_CREATED)
def create_order_payment(
    order_id: int,
    payload: OrderPaymentCreate,
    db: Session = Depends(get_db),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    current_user: CurrentUserContext = Depends(require_permission("orders.payments.create")),
) -> OrderPaymentRead:
    service = CrmOrderPaymentService(db)
    return OrderPaymentRead.model_validate(
        service.create(order_id, payload, idempotency_key=idempotency_key, actor_user_id=current_user.user.id)
    )


@router.put("/orders/{order_id}/payments/{payment_id}", response_model=OrderPaymentRead)
def update_order_payment(
    order_id: int,
    payment_id: int,
    payload: OrderPaymentUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.payments.edit")),
) -> OrderPaymentRead:
    service = CrmOrderPaymentService(db)
    return OrderPaymentRead.model_validate(
        service.update(order_id, payment_id, payload, actor_user_id=current_user.user.id)
    )


@router.delete("/orders/{order_id}/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order_payment(
    order_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.payments.delete")),
) -> Response:
    CrmOrderPaymentService(db).delete(order_id, payment_id, actor_user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
