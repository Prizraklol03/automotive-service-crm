from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field

from app.crm.schemas.common import CrmSchema
from app.crm.schemas.order_payment import OrderPaymentRead


def _coerce_order_datetime(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    if isinstance(value, str) and len(value) == 10:
        try:
            return datetime.combine(date.fromisoformat(value), time.min)
        except ValueError:
            return value
    return value


OrderScheduleDateTime = Annotated[datetime | None, BeforeValidator(_coerce_order_datetime)]


class OrderServiceCreate(CrmSchema):
    service_catalog_id: int | None = None
    service_name_snapshot: str = Field(min_length=1, max_length=255)
    category_name_snapshot: str | None = Field(default=None, max_length=255)
    unit_price: Decimal = Field(ge=0)
    quantity: int = Field(ge=1)
    sort_key: int = 0


class OrderServiceRead(CrmSchema):
    id: int
    service_catalog_id: int | None
    service_name_snapshot: str
    category_name_snapshot: str | None
    unit_price: Decimal
    quantity: int
    row_total: Decimal
    sort_key: int


class OrderCreate(CrmSchema):
    client_id: int
    payer_client_id: int | None = None
    vehicle_id: int
    status: str | None = None
    due_date: OrderScheduleDateTime = None
    scheduled_for: OrderScheduleDateTime = None
    handover_at: OrderScheduleDateTime = None
    comment: str | None = None
    discount_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    discount_type: Literal["fixed", "percent"] = "fixed"
    services: list[OrderServiceCreate] = Field(default_factory=list)


class OrderStatusUpdate(CrmSchema):
    status: str
    completed_at: datetime | None = None


class OrderStatusHistoryEntryRead(CrmSchema):
    status: str
    changed_at: datetime


class OrderClientSummaryRead(CrmSchema):
    id: int
    full_name: str
    phone_display: str


class OrderVehicleSummaryRead(CrmSchema):
    id: int
    client_id: int
    plate_number_display: str
    brand: str | None = None
    model: str | None = None
    vin: str | None = None
    display_name: str


class OrderRead(CrmSchema):
    id: int
    client_id: int
    payer_client_id: int | None
    vehicle_id: int
    status: str
    status_display_name: str
    status_group: str
    status_color: str
    completed_at: datetime | None
    due_date: datetime | None
    scheduled_for: datetime | None
    handover_at: datetime | None
    comment: str | None
    discount_value: Decimal
    discount_type: Literal["fixed", "percent"]
    services_total: Decimal
    amount_to_pay: Decimal
    paid_total: Decimal
    balance_due: Decimal
    payment_status: Literal["unpaid", "partial", "paid", "overpaid"]
    is_archived: bool
    client_summary: OrderClientSummaryRead
    vehicle_summary: OrderVehicleSummaryRead
    services: list[OrderServiceRead]
    payments: list[OrderPaymentRead] = Field(default_factory=list)
    status_history: list[OrderStatusHistoryEntryRead] = Field(default_factory=list)


class OrderSummaryRead(CrmSchema):
    id: int
    client_id: int
    payer_client_id: int | None
    vehicle_id: int
    status: str
    status_display_name: str
    status_group: str
    status_color: str
    status_changed_at: datetime | None = None
    updated_at: datetime
    completed_at: datetime | None
    due_date: datetime | None = None
    scheduled_for: datetime | None = None
    handover_at: datetime | None = None
    comment: str | None
    discount_value: Decimal
    discount_type: Literal["fixed", "percent"]
    services_total: Decimal
    amount_to_pay: Decimal
    paid_total: Decimal
    balance_due: Decimal
    payment_status: Literal["unpaid", "partial", "paid", "overpaid"]
    is_archived: bool
    client_full_name: str
    client_phone: str
    vehicle_plate_number: str
    vehicle_brand: str | None = None
    vehicle_model: str | None = None
    service_names: list[str] = Field(default_factory=list)
    vehicle_vin: str | None = None
    primary_category_name: str | None = None
    primary_category_color: str | None = None
    category_colors: list[str] = Field(default_factory=list)


class OrderListSummaryRead(CrmSchema):
    total: int
    active_total: int
    archived_total: int
    active_in_progress_total: int
    active_waiting_total: int
    active_amount_to_pay: Decimal
    status_counts: dict[str, int] = Field(default_factory=dict)
