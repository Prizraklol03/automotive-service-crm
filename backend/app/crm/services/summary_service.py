from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time import app_now_naive
from app.crm.models.order import CrmOrder
from app.crm.models.reminder import ReminderTargetType
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.order_repository import OrderRepository
from app.crm.repositories.reminder_repository import ReminderRepository
from app.crm.repositories.vehicle_repository import VehicleRepository
from app.crm.schemas.client import ClientRead
from app.crm.schemas.order import OrderSummaryRead
from app.crm.schemas.summary import (
    ClientDetailRead,
    ClientSummaryRead,
    OrderHistoryRead,
    ServiceFrequencyRead,
    ServiceHistoryEntryRead,
    ServiceHistoryRead,
    VehicleDetailRead,
    VehicleOwnerHistoryRead,
    VehicleSummaryRead,
)
from app.crm.services.order_payment_service import summarize_order_payments
from app.crm.services.reminder_service import ReminderService


ZERO = Decimal("0.00")


class SummaryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.clients = ClientRepository(session)
        self.vehicles = VehicleRepository(session)
        self.orders = OrderRepository(session)
        self.reminders = ReminderRepository(session)
        self.reminder_service = ReminderService(session)

    def get_client_summary(self, client_id: int) -> ClientSummaryRead:
        client = self.clients.get_by_id(client_id, include_deleted=True)
        if not client:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        all_orders = self.orders.list_by_client(client_id)
        completed_orders = self._completed_orders(all_orders)
        return ClientSummaryRead(
            client_id=client.id,
            full_name=client.display_label,
            phone_display=client.phone_display,
            total_orders=len(all_orders),
            completed_orders_count=len(completed_orders),
            total_turnover=sum((order.amount_to_pay for order in completed_orders), ZERO),
            total_profit=self._neutral_total_profit(),
            average_check=self._average_check(completed_orders),
            last_visit=self._last_visit(completed_orders),
            most_frequent_services=self._most_frequent_services(completed_orders),
            active_reminders=self._active_reminders(ReminderTargetType.CLIENT, client.id),
        )

    def get_client_detail(self, client_id: int) -> ClientDetailRead:
        client = self.clients.get_by_id(client_id, include_deleted=True)
        if not client:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        client_data = ClientRead.model_validate(client).model_dump()
        client_data["orders"] = [self._to_order_summary(order) for order in self.orders.list_by_client(client_id)]
        return ClientDetailRead.model_validate(client_data)


    def list_client_orders(self, client_id: int) -> OrderHistoryRead:
        if not self.clients.get_by_id(client_id, include_deleted=True):
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        return OrderHistoryRead(orders=[self._to_order_summary(order) for order in self.orders.list_by_client(client_id)])

    def list_client_services_history(self, client_id: int) -> ServiceHistoryRead:
        if not self.clients.get_by_id(client_id, include_deleted=True):
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        return ServiceHistoryRead(services=self._service_history(self._completed_orders(self.orders.list_by_client(client_id))))

    def get_vehicle_summary(self, vehicle_id: int) -> VehicleSummaryRead:
        vehicle = self.vehicles.get_by_id(vehicle_id, include_deleted=True)
        if not vehicle:
            raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
        all_orders = self.orders.list_by_vehicle(vehicle_id)
        completed_orders = self._completed_orders(all_orders)
        return VehicleSummaryRead(
            vehicle_id=vehicle.id,
            client_id=self.vehicles.current_owner_client_id(vehicle),
            plate_number_display=vehicle.plate_number_display,
            brand=vehicle.brand_ref.name if vehicle.brand_ref else vehicle.brand,
            model=vehicle.model_ref.name if vehicle.model_ref else vehicle.model,
            total_orders=len(all_orders),
            completed_orders_count=len(completed_orders),
            total_turnover=sum((order.amount_to_pay for order in completed_orders), ZERO),
            total_profit=self._neutral_total_profit(),
            average_check=self._average_check(completed_orders),
            last_visit=self._last_visit(completed_orders),
            most_frequent_services=self._most_frequent_services(completed_orders),
            active_reminders=self._active_reminders(ReminderTargetType.ORDER, None, vehicle_id=vehicle.id),
        )

    def get_vehicle_detail(self, vehicle_id: int) -> VehicleDetailRead:
        vehicle = self.vehicles.get_by_id(vehicle_id, include_deleted=True)
        if not vehicle:
            raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
        current_owner = next((history for history in vehicle.owner_history if history.owned_to is None), None)
        current_owner_client = current_owner.client if current_owner and current_owner.client else vehicle.client
        if current_owner_client is None:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        return VehicleDetailRead(
            id=vehicle.id,
            client_id=vehicle.client_id,
            plate_number_display=vehicle.plate_number_display,
            plate_number_normalized=vehicle.plate_number_normalized,
            vin=vehicle.vin,
            brand_id=vehicle.brand_id,
            model_id=vehicle.model_id,
            brand=vehicle.brand,
            model=vehicle.model,
            year=vehicle.year,
            mileage=vehicle.mileage,
            color=vehicle.color,
            comment=vehicle.comment,
            is_deleted=vehicle.is_deleted,
            deleted_at=vehicle.deleted_at,
            current_owner_full_name=current_owner_client.display_label,
            current_owner_phone_display=current_owner_client.phone_display,
            orders=[self._to_order_summary(order) for order in self.orders.list_by_vehicle(vehicle_id)],
            owner_history=[self._to_owner_history_entry(history) for history in vehicle.owner_history],
        )

    def list_vehicle_orders(self, vehicle_id: int) -> OrderHistoryRead:
        if not self.vehicles.get_by_id(vehicle_id, include_deleted=True):
            raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
        return OrderHistoryRead(orders=[self._to_order_summary(order) for order in self.orders.list_by_vehicle(vehicle_id)])

    def list_vehicle_services_history(self, vehicle_id: int) -> ServiceHistoryRead:
        if not self.vehicles.get_by_id(vehicle_id, include_deleted=True):
            raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
        return ServiceHistoryRead(services=self._service_history(self._completed_orders(self.orders.list_by_vehicle(vehicle_id))))

    def _active_reminders(
        self,
        target_type: ReminderTargetType,
        target_id: int | None,
        *,
        vehicle_id: int | None = None,
    ):
        now = app_now_naive()
        if target_type == ReminderTargetType.CLIENT and target_id is not None:
            reminders = self.reminders.list_active_by_target(target_type, target_id, now)
            return [self.reminder_service.get(reminder.id) for reminder in reminders]

        assert vehicle_id is not None
        order_ids = [order.id for order in self.orders.list_by_vehicle(vehicle_id)]
        active = []
        for order_id in order_ids:
            active.extend(self.reminders.list_active_by_target(ReminderTargetType.ORDER, order_id, now))
        active.sort(key=lambda reminder: ((reminder.postpone_until or reminder.due_at), reminder.id))
        return [self.reminder_service.get(reminder.id) for reminder in active]

    @staticmethod
    def _completed_orders(orders: list[CrmOrder]) -> list[CrmOrder]:
        completed = [
            order
            for order in orders
            if order.completed_at is not None
        ]
        completed.sort(key=lambda order: (order.completed_at, order.id), reverse=True)
        return completed

    @staticmethod
    def _average_check(completed_orders: list[CrmOrder]) -> Decimal:
        if not completed_orders:
            return ZERO
        turnover = sum((order.amount_to_pay for order in completed_orders), ZERO)
        return (turnover / len(completed_orders)).quantize(Decimal("0.01"))

    @staticmethod
    def _neutral_total_profit() -> Decimal:
        return ZERO

    @staticmethod
    def _last_visit(completed_orders: list[CrmOrder]):
        return completed_orders[0].completed_at if completed_orders else None

    @staticmethod
    def _most_frequent_services(completed_orders: list[CrmOrder]) -> list[ServiceFrequencyRead]:
        buckets: dict[tuple[str, str | None], dict] = defaultdict(
            lambda: {"quantity_total": 0, "orders": set(), "turnover": ZERO}
        )
        for order in completed_orders:
            for service in order.services:
                key = (service.service_name_snapshot, service.category_name_snapshot)
                bucket = buckets[key]
                bucket["quantity_total"] += service.quantity
                bucket["orders"].add(order.id)
                bucket["turnover"] += service.row_total

        ranked = sorted(
            buckets.items(),
            key=lambda item: (-item[1]["quantity_total"], -len(item[1]["orders"]), item[0][0].lower()),
        )
        return [
            ServiceFrequencyRead(
                service_name=service_name,
                category_name=category_name,
                quantity_total=bucket["quantity_total"],
                orders_count=len(bucket["orders"]),
                turnover=bucket["turnover"],
            )
            for (service_name, category_name), bucket in ranked[:5]
        ]

    @staticmethod
    def _service_history(completed_orders: list[CrmOrder]) -> list[ServiceHistoryEntryRead]:
        entries: list[ServiceHistoryEntryRead] = []
        for order in completed_orders:
            ordered_services = sorted(order.services, key=lambda service: (service.sort_key, service.id))
            for service in ordered_services:
                entries.append(
                    ServiceHistoryEntryRead(
                        order_id=order.id,
                        client_id=order.client_id,
                        vehicle_id=order.vehicle_id,
                        completed_at=order.completed_at,
                        service_name=service.service_name_snapshot,
                        category_name=service.category_name_snapshot,
                        quantity=service.quantity,
                        unit_price=service.unit_price,
                        row_total=service.row_total,
                        vehicle_plate_number=order.vehicle.plate_number_display,
                        client_full_name=order.client.display_label,
                    )
                )
        return entries

    @staticmethod
    def _to_order_summary(order: CrmOrder) -> OrderSummaryRead:
        payment_totals = summarize_order_payments(order)
        return OrderSummaryRead(
            id=order.id,
            client_id=order.client_id,
            payer_client_id=order.payer_client_id,
            vehicle_id=order.vehicle_id,
            status=order.status,
            status_display_name=order.status_record.display_name if order.status_record else order.status,
            status_group=order.status_record.status_group if order.status_record else "new",
            status_color=order.status_record.color if order.status_record else "#6b7280",
            completed_at=order.completed_at,
            status_changed_at=order.updated_at,
            updated_at=order.updated_at,
            due_date=order.due_date,
            scheduled_for=order.scheduled_for,
            handover_at=order.handover_at,
            comment=order.comment,
            discount_value=order.discount_value,
            discount_type=order.discount_type,
            services_total=order.services_total,
            amount_to_pay=order.amount_to_pay,
            paid_total=payment_totals.paid_total,
            balance_due=payment_totals.balance_due,
            payment_status=payment_totals.payment_status,
            is_archived=order.is_archived,
            client_full_name=order.client.display_label,
            client_phone=order.client.phone_display,
            vehicle_plate_number=order.vehicle.plate_number_display,
            vehicle_brand=order.vehicle.brand,
            vehicle_model=order.vehicle.model,
        )

    @staticmethod
    def _to_owner_history_entry(history) -> VehicleOwnerHistoryRead:
        return VehicleOwnerHistoryRead(
            id=history.id,
            client_id=history.client_id,
            client_full_name=history.client.display_label,
            title=f"Новый владелец — {history.client.display_label}",
            owned_from=history.owned_from,
            owned_to=history.owned_to,
            comment=history.comment,
            status="current" if history.owned_to is None else "former",
        )
