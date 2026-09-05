from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time import app_now_naive
from app.crm.models.order import CrmOrder, OrderStatus
from app.crm.models.order_status import StatusGroup
from app.crm.models.order_service import CrmOrderService
from app.crm.repositories.material_repository import MaterialRepository
from app.crm.repositories.order_repository import OrderRepository
from app.crm.repositories.service_category_repository import ServiceCategoryRepository
from app.crm.schemas.analytics import (
    AnalyticsCategoryOrderRead,
    AnalyticsCategoryOrdersRead,
    AnalyticsCategoryRead,
    AnalyticsFilterEchoRead,
    AnalyticsOverviewRead,
    AnalyticsServiceBreakdownRead,
)
from app.crm.services.order_calculation_service import OrderCalculationService


ZERO = Decimal("0.00")


@dataclass(frozen=True)
class CategoryKey:
    category_id: int | None
    category_name: str


class AnalyticsService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.orders = OrderRepository(session)
        self.materials = MaterialRepository(session)
        self.categories = ServiceCategoryRepository(session)

    def get_overview(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        category_ids: list[int] | None = None,
    ) -> AnalyticsOverviewRead:
        date_from, date_to = resolve_analytics_period(date_from=date_from, date_to=date_to)
        filtered_orders = self._filter_orders(date_from=date_from, date_to=date_to, category_ids=category_ids)
        first_completed_by_client = self.orders.get_first_completed_by_client_up_to(date_to=date_to)
        category_filter = set(category_ids or [])
        materials = self.materials.list_in_period(
            date_from=date_from,
            date_to=date_to,
            category_ids=category_ids,
        )
        if category_filter:
            turnover = sum((self._order_category_service_total(order, category_filter) for order in filtered_orders), ZERO)
        else:
            turnover = sum((order.amount_to_pay for order in filtered_orders), ZERO)
        discount_total = sum((OrderCalculationService.effective_discount_amount(order) for order in filtered_orders), ZERO)
        materials_total = sum((expense.row_total for expense in materials), ZERO)
        profit = turnover - materials_total
        completed_orders_count = len(filtered_orders)
        average_check = (turnover / completed_orders_count).quantize(Decimal("0.01")) if completed_orders_count else ZERO

        new_clients = 0
        repeat_clients = 0
        for order in filtered_orders:
            if first_completed_by_client.get(order.client_id) == order.id:
                new_clients += 1
            else:
                repeat_clients += 1

        return AnalyticsOverviewRead(
            completed_orders_count=completed_orders_count,
            turnover=turnover,
            discount_total=discount_total,
            materials_total=materials_total,
            profit=profit,
            average_check=average_check,
            new_clients=new_clients,
            repeat_clients=repeat_clients,
        )

    def get_categories(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        category_ids: list[int] | None = None,
    ) -> list[AnalyticsCategoryRead]:
        date_from, date_to = resolve_analytics_period(date_from=date_from, date_to=date_to)
        filtered_orders = self._filter_orders(date_from=date_from, date_to=date_to, category_ids=category_ids)
        materials = self.materials.list_in_period(
            date_from=date_from,
            date_to=date_to,
            category_ids=category_ids,
        )
        category_totals: dict[CategoryKey, dict] = {}

        for order in filtered_orders:
            services_by_category: dict[CategoryKey, list[CrmOrderService]] = defaultdict(list)
            for service in order.services:
                category_key = self._resolve_category_key(service)
                if category_ids and category_key.category_id not in category_ids:
                    continue
                services_by_category[category_key].append(service)

            for category_key, services in services_by_category.items():
                if category_key not in category_totals:
                    category_totals[category_key] = {
                        "order_ids": set(),
                        "service_total": ZERO,
                        "materials_total": ZERO,
                        "service_breakdown": defaultdict(
                            lambda: {"quantity_total": 0, "orders": set(), "service_total": ZERO, "materials_total": ZERO}
                        ),
                    }

                bucket = category_totals[category_key]
                bucket["order_ids"].add(order.id)
                for service in services:
                    bucket["service_total"] += service.row_total

                    breakdown = bucket["service_breakdown"][service.service_name_snapshot]
                    breakdown["quantity_total"] += service.quantity
                    breakdown["orders"].add(order.id)
                    breakdown["service_total"] += service.row_total

        for expense in materials:
            category_key = CategoryKey(
                category_id=expense.service_category_id,
                category_name=expense.service_category.name if expense.service_category else "Без категории",
            )
            if category_key not in category_totals:
                category_totals[category_key] = {
                    "order_ids": set(),
                    "service_total": ZERO,
                    "materials_total": ZERO,
                    "service_breakdown": defaultdict(
                        lambda: {"quantity_total": 0, "orders": set(), "service_total": ZERO, "materials_total": ZERO}
                    ),
                }
            category_totals[category_key]["materials_total"] += expense.row_total

        results: list[AnalyticsCategoryRead] = []
        for category_key, bucket in sorted(category_totals.items(), key=lambda item: item[0].category_name.lower()):
            service_rows = [
                AnalyticsServiceBreakdownRead(
                    service_name=service_name,
                    quantity_total=service_bucket["quantity_total"],
                    orders_count=len(service_bucket["orders"]),
                    service_total=service_bucket["service_total"],
                )
                for service_name, service_bucket in sorted(bucket["service_breakdown"].items(), key=lambda item: item[0].lower())
            ]
            results.append(
                AnalyticsCategoryRead(
                    category_id=category_key.category_id,
                    category_name=category_key.category_name,
                    completed_orders_count=len(bucket["order_ids"]),
                    service_total=bucket["service_total"],
                    materials_total=bucket["materials_total"],
                    profit=bucket["service_total"] - bucket["materials_total"],
                    services_used=service_rows,
                )
            )
        return results

    def get_category_orders(
        self,
        category_ref: str,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> AnalyticsCategoryOrdersRead:
        date_from, date_to = resolve_analytics_period(date_from=date_from, date_to=date_to)
        category_ids = [self._resolve_category_id(category_ref)]
        category_filter = set(category_ids)
        filtered_orders = self._filter_orders(date_from=date_from, date_to=date_to, category_ids=category_ids)
        materials = self.materials.list_in_period(
            date_from=date_from,
            date_to=date_to,
            category_ids=category_ids,
        )
        orders = [
            self._to_category_order_summary(order, category_filter)
            for order in filtered_orders
            if self._order_matches_categories(order, category_filter)
        ]
        service_total = sum((order.category_service_total for order in orders), ZERO)
        materials_total = sum((expense.row_total for expense in materials), ZERO)
        return AnalyticsCategoryOrdersRead(
            filter=AnalyticsFilterEchoRead(
                date_from=date_from,
                date_to=date_to,
                category_ids=category_ids,
            ),
            service_total=service_total,
            materials_total=materials_total,
            profit=service_total - materials_total,
            orders=orders,
            generated_at=app_now_naive(),
        )

    def _filter_orders(
        self,
        *,
        date_from: date | None,
        date_to: date | None,
        category_ids: list[int] | None,
    ) -> list[CrmOrder]:
        category_filter = set(category_ids or [])
        filtered_orders: list[CrmOrder] = []
        for order in self.orders.list_completed_in_period(date_from=date_from, date_to=date_to):
            if category_filter and not self._order_matches_categories(order, category_filter):
                continue
            filtered_orders.append(order)
        filtered_orders.sort(key=lambda order: (order.completed_at, order.id), reverse=True)
        return filtered_orders

    def _order_matches_categories(self, order: CrmOrder, category_ids: set[int]) -> bool:
        for service in order.services:
            category_key = self._resolve_category_key(service)
            if category_key.category_id in category_ids:
                return True
        return False

    def _resolve_category_key(self, service: CrmOrderService) -> CategoryKey:
        if service.service_catalog and service.service_catalog.category:
            category = service.service_catalog.category
            return CategoryKey(category_id=category.id, category_name=category.name)

        snapshot_name = (service.category_name_snapshot or "").strip()
        if snapshot_name:
            category = self.categories.get_by_name(snapshot_name)
            return CategoryKey(category_id=category.id if category else None, category_name=snapshot_name)

        return CategoryKey(category_id=None, category_name="Без категории")

    def _resolve_category_id(self, category_ref: str) -> int:
        stripped_ref = category_ref.strip()
        if stripped_ref.isdigit():
            category = self.categories.get_by_id(int(stripped_ref))
        else:
            category = self.categories.get_by_name(stripped_ref)
        if not category:
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)
        return category.id

    def _to_category_order_summary(self, order: CrmOrder, category_ids: set[int]) -> AnalyticsCategoryOrderRead:
        return AnalyticsCategoryOrderRead(
            id=order.id,
            client_id=order.client_id,
            vehicle_id=order.vehicle_id,
            status=order.status,
            client_full_name=order.client.full_name,
            vehicle_plate_number=order.vehicle.plate_number_display,
            category_service_total=self._order_category_service_total(order, category_ids),
        )

    def _order_category_service_total(self, order: CrmOrder, category_ids: set[int]) -> Decimal:
        total = ZERO
        for service in order.services:
            category_key = self._resolve_category_key(service)
            if category_key.category_id in category_ids:
                total += service.row_total
        return total


def get_default_analytics_period(
    today: date | None = None,
    *,
    working_month_start_day: int = 25,
) -> tuple[date, date]:
    reference_date = today or app_now_naive().date()
    start_day = min(28, max(1, int(working_month_start_day or 25)))
    if reference_date.day >= start_day:
        period_start = reference_date.replace(day=start_day)
    else:
        previous_month_last_day = reference_date.replace(day=1) - timedelta(days=1)
        period_start = previous_month_last_day.replace(day=start_day)

    next_month_start = (period_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    period_end = next_month_start.replace(day=start_day) - timedelta(days=1)
    return period_start, period_end


def resolve_analytics_period(
    *,
    date_from: date | None,
    date_to: date | None,
    working_month_start_day: int = 25,
) -> tuple[date | None, date | None]:
    if date_from is None and date_to is None:
        return get_default_analytics_period(working_month_start_day=working_month_start_day)
    return date_from, date_to
