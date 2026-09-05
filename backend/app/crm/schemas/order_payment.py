from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.crm.models.order_payment import OrderPaymentMethod
from app.crm.schemas.common import CrmSchema


class OrderPaymentCreate(CrmSchema):
    amount: Decimal = Field(gt=0)
    payment_date: datetime
    payment_method: OrderPaymentMethod
    comment: str | None = Field(default=None, max_length=1000)


class OrderPaymentUpdate(OrderPaymentCreate):
    pass


class OrderPaymentRead(CrmSchema):
    id: int
    order_id: int
    amount: Decimal
    payment_date: datetime
    payment_method: OrderPaymentMethod
    comment: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
