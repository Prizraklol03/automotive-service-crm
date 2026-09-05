from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from datetime import date
from typing import Literal

from pydantic import Field

from app.crm.schemas.common import CrmSchema
from app.crm.schemas.client import ClientRead
from app.crm.schemas.order import OrderSummaryRead
from app.crm.schemas.reminder import ReminderRead
from app.crm.schemas.vehicle import VehicleRead


class ServiceFrequencyRead(CrmSchema):
    service_name: str
    category_name: str | None
    quantity_total: int
    orders_count: int
    turnover: Decimal


class ServiceHistoryEntryRead(CrmSchema):
    order_id: int
    client_id: int
    vehicle_id: int
    completed_at: datetime
    service_name: str
    category_name: str | None
    quantity: int
    unit_price: Decimal
    row_total: Decimal
    vehicle_plate_number: str
    client_full_name: str


class ClientSummaryRead(CrmSchema):
    client_id: int
    full_name: str
    phone_display: str
    total_orders: int
    completed_orders_count: int
    total_turnover: Decimal
    total_profit: Decimal
    average_check: Decimal
    last_visit: datetime | None
    most_frequent_services: list[ServiceFrequencyRead]
    active_reminders: list[ReminderRead]


class ClientDetailRead(ClientRead):
    orders: list[OrderSummaryRead] = Field(default_factory=list)


class VehicleSummaryRead(CrmSchema):
    vehicle_id: int
    client_id: int
    plate_number_display: str
    brand: str | None
    model: str | None
    total_orders: int
    completed_orders_count: int
    total_turnover: Decimal
    total_profit: Decimal
    average_check: Decimal
    last_visit: datetime | None
    most_frequent_services: list[ServiceFrequencyRead]
    active_reminders: list[ReminderRead]


class VehicleOwnerHistoryRead(CrmSchema):
    id: int
    client_id: int
    client_full_name: str
    title: str
    owned_from: date
    owned_to: date | None
    comment: str | None
    status: Literal["current", "former"]


class VehicleDetailRead(VehicleRead):
    current_owner_full_name: str
    current_owner_phone_display: str
    orders: list[OrderSummaryRead] = Field(default_factory=list)
    owner_history: list[VehicleOwnerHistoryRead] = Field(default_factory=list)


class OrderHistoryRead(CrmSchema):
    orders: list[OrderSummaryRead]


class ServiceHistoryRead(CrmSchema):
    services: list[ServiceHistoryEntryRead]
