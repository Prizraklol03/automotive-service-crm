from __future__ import annotations





from collections import defaultdict


from dataclasses import dataclass


from datetime import date, datetime, timedelta


from decimal import Decimal, ROUND_HALF_UP


from typing import Iterable





from sqlalchemy.orm import Session





from app.core.errors import AppError


from app.core.time import app_now_naive


from app.crm.models.finance_expense import CrmFinanceExpense


from app.crm.models.material import CrmMaterial
from app.crm.models.order import CrmOrder, OrderStatus


from app.crm.models.order_status import CrmOrderStatus, StatusGroup, ARCHIVED_GROUPS, ACTIVE_GROUPS


from app.crm.models.order_service import CrmOrderService


from app.crm.repositories.finance_expense_repository import FinanceExpenseRepository


from app.crm.repositories.material_repository import MaterialRepository
from app.crm.repositories.order_repository import OrderRepository


from app.crm.repositories.service_category_repository import ServiceCategoryRepository
from app.crm.services.order_calculation_service import OrderCalculationService
from app.crm.schemas.analytics import (


    AnalyticsChartGroupRead,


    AnalyticsChartPointRead,


    AnalyticsClientRowRead,


    AnalyticsDashboardRead,


    AnalyticsDrilldownRead,


    AnalyticsDrilldownRowRead,


    AnalyticsFilterEchoRead,


    AnalyticsFinanceCategoryRowRead,


    AnalyticsFinancesTabRead,


    AnalyticsFunnelStepRead,


    AnalyticsInsightRead,


    AnalyticsKpiRead,


    AnalyticsLatestFinanceRead,


    AnalyticsOrdersRowRead,


    AnalyticsOrdersTabRead,


    AnalyticsOverviewTabRead,


    AnalyticsSegmentRead,


    AnalyticsServiceCategoryRowRead,


    AnalyticsServicesTabRead,


    AnalyticsServiceRowRead,


    AnalyticsSuppliesTabRead,


    AnalyticsSupplyRowRead,


    AnalyticsTopCategoryRead,


    AnalyticsTopClientRead,


    AnalyticsTopNamedAmountRead,


    AnalyticsTopServiceRead,


    AnalyticsWaterfallStepRead,


    AnalyticsClientsTabRead,


)








ZERO = Decimal("0.00")


HUNDRED = Decimal("100.00")


MONEY_PLACES = Decimal("0.01")


# UNPAID_ORDER_STATUSES replaced by group-based logic








@dataclass(frozen=True)


class AnalyticsFilters:


    date_from: date


    date_to: date


    period_preset: str


    category_ids: tuple[int, ...]


    order_statuses: tuple[str, ...]


    finance_category_ids: tuple[int, ...]








@dataclass(frozen=True)


class ServiceScope:


    service: CrmOrderService


    category_id: int | None


    category_name: str


    materials_total: Decimal








@dataclass(frozen=True)


class OrderScope:


    order: CrmOrder


    services: tuple[ServiceScope, ...]


    services_total: Decimal


    materials_total: Decimal


    discount_total: Decimal


    amount_to_pay: Decimal


    gross_profit: Decimal








@dataclass(frozen=True)


class AnalyticsDataset:


    filters: AnalyticsFilters


    active_orders: tuple[CrmOrder, ...]


    period_orders: tuple[CrmOrder, ...]


    completed_orders: tuple[OrderScope, ...]


    finances: tuple[CrmFinanceExpense, ...]


    standalone_materials: tuple[CrmMaterial, ...]
    previous_completed_orders: tuple[OrderScope, ...]


    previous_finances: tuple[CrmFinanceExpense, ...]


    previous_standalone_materials: tuple[CrmMaterial, ...]
    first_completed_by_client: dict[int, int]








def quantize_money(value: Decimal | int | float | str) -> Decimal:


    if isinstance(value, Decimal):


        amount = value


    else:


        amount = Decimal(str(value))


    return amount.quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)








def safe_div(value: Decimal, divisor: Decimal | int) -> Decimal:


    if not divisor:


        return ZERO


    return quantize_money(value / Decimal(str(divisor)))








def percent(part: Decimal, total: Decimal) -> Decimal:


    if total == ZERO:


        return ZERO


    return quantize_money((part / total) * HUNDRED)








def money_to_str(value: Decimal) -> str:


    return f"{quantize_money(value):.2f}"








def int_to_str(value: int) -> str:


    return str(value)








def daterange_days(date_from: date, date_to: date) -> int:


    return max((date_to - date_from).days + 1, 1)








class AnalyticsV3Service:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.orders = OrderRepository(session)
        self.finance_expenses = FinanceExpenseRepository(session)
        self.materials = MaterialRepository(session)
        self.categories = ServiceCategoryRepository(session)

    def _working_month_start_day(self) -> int:
        from app.crm.services.settings_service import SettingsService

        value = SettingsService(self.session).get_visual_config().working_month_start_day
        return min(28, max(1, int(value or 25)))


    def _status_group_map(self) -> dict[str, str]:

        """Возвращает {code: status_group} для всех статусов. Кешируется на запрос."""

        if not hasattr(self, "_cached_status_groups"):

            from sqlalchemy import select as _select

            statuses = list(self.session.scalars(_select(CrmOrderStatus)))

            self._cached_status_groups: dict[str, str] = {s.code: s.status_group for s in statuses}

        return self._cached_status_groups



    def _is_closed(self, order: "CrmOrder") -> bool:

        return self._status_group_map().get(order.status) == StatusGroup.CLOSED.value



    def _is_cancelled(self, order: "CrmOrder") -> bool:

        return self._status_group_map().get(order.status) == StatusGroup.CANCELLED.value



    def _is_active(self, order: "CrmOrder") -> bool:

        return self._status_group_map().get(order.status) in {g.value for g in ACTIVE_GROUPS}



    def _is_in_progress(self, order: "CrmOrder") -> bool:

        return self._status_group_map().get(order.status) == StatusGroup.IN_PROGRESS.value





    def get_dashboard(


        self,


        *,


        date_from: date | None = None,


        date_to: date | None = None,


        period_preset: str = "working_month",


        category_ids: list[int] | None = None,


        order_statuses: list[str] | None = None,


        finance_category_ids: list[int] | None = None,


    ) -> AnalyticsDashboardRead:


        filters = self._build_filters(


            date_from=date_from,


            date_to=date_to,


            period_preset=period_preset,


            category_ids=category_ids,


            order_statuses=order_statuses,


            finance_category_ids=finance_category_ids,


        )


        generated_at = app_now_naive()


        dataset = self._build_dataset(filters)


        return AnalyticsDashboardRead(


            filter=self._to_filter_echo(filters),


            overview=self._build_overview_tab(dataset),


            orders=self._build_orders_tab(dataset),


            services=self._build_services_tab(dataset),


            supplies=self._build_supplies_tab(dataset),


            finances=self._build_finances_tab(dataset),


            clients=self._build_clients_tab(dataset),


            generated_at=generated_at,


        )





    def get_drilldown(


        self,


        *,


        metric: str,


        date_from: date | None = None,


        date_to: date | None = None,


        period_preset: str = "working_month",


        category_ids: list[int] | None = None,


        order_statuses: list[str] | None = None,


        finance_category_ids: list[int] | None = None,


        category_id: int | None = None,


        service_name: str | None = None,


        client_id: int | None = None,


        point_from: date | None = None,


        point_to: date | None = None,


    ) -> AnalyticsDrilldownRead:


        filters = self._build_filters(


            date_from=date_from,


            date_to=date_to,


            period_preset=period_preset,


            category_ids=category_ids,


            order_statuses=order_statuses,


            finance_category_ids=finance_category_ids,


        )


        if point_from and point_to:


            filters = AnalyticsFilters(


                date_from=point_from,


                date_to=point_to,


                period_preset="custom",


                category_ids=filters.category_ids,


                order_statuses=filters.order_statuses,


                finance_category_ids=filters.finance_category_ids,


            )


        dataset = self._build_dataset(filters)


        title, subtitle, rows = self._build_drilldown_rows(


            dataset,


            metric=metric,


            category_id=category_id,


            service_name=service_name,


            client_id=client_id,


        )


        return AnalyticsDrilldownRead(


            metric=metric,


            title=title,


            subtitle=subtitle,


            rows=rows,


            generated_at=app_now_naive(),


        )





    def _build_filters(


        self,


        *,


        date_from: date | None,


        date_to: date | None,


        period_preset: str,


        category_ids: list[int] | None,


        order_statuses: list[str] | None,


        finance_category_ids: list[int] | None,


    ) -> AnalyticsFilters:


        resolved_from, resolved_to = resolve_analytics_period(
            date_from=date_from,
            date_to=date_to,
            period_preset=period_preset,
            working_month_start_day=self._working_month_start_day(),
        )
        return AnalyticsFilters(


            date_from=resolved_from,


            date_to=resolved_to,


            period_preset=period_preset,


            category_ids=tuple(category_ids or ()),


            order_statuses=tuple(order_statuses or ()),


            finance_category_ids=tuple(finance_category_ids or ()),


        )





    def _to_filter_echo(self, filters: AnalyticsFilters) -> AnalyticsFilterEchoRead:


        return AnalyticsFilterEchoRead(


            date_from=filters.date_from,


            date_to=filters.date_to,


            category_ids=list(filters.category_ids),


            order_statuses=list(filters.order_statuses),


            finance_category_ids=list(filters.finance_category_ids),


            period_preset=filters.period_preset,


        )





    def _build_dataset(self, filters: AnalyticsFilters) -> AnalyticsDataset:

        active_orders = tuple(self.orders.list_active_for_analytics())

        period_orders = tuple(
            self.orders.list_period_orders(
                date_from=filters.date_from,
                date_to=filters.date_to,
                status_codes=filters.order_statuses,
            )
        )

        completed_orders = tuple(
            scope
            for scope in (
                self._scope_order(order, filters.category_ids)
                for order in self.orders.list_completed_in_period(date_from=filters.date_from, date_to=filters.date_to)
            )
            if scope
        )

        finances = tuple(
            expense
            for expense in self.finance_expenses.list_in_period(
                date_from=filters.date_from,
                date_to=filters.date_to,
            )
            if not filters.finance_category_ids or expense.category_id in filters.finance_category_ids
        )

        standalone_materials = tuple(
            self.materials.list_in_period(
                date_from=filters.date_from,
                date_to=filters.date_to,
                category_ids=list(filters.category_ids) if filters.category_ids else None,
            )
        )

        previous_from, previous_to = previous_period(filters.date_from, filters.date_to)

        previous_filters = AnalyticsFilters(
            date_from=previous_from,
            date_to=previous_to,
            period_preset="custom",
            category_ids=filters.category_ids,
            order_statuses=filters.order_statuses,
            finance_category_ids=filters.finance_category_ids,
        )

        previous_completed_orders = tuple(
            scope
            for scope in (
                self._scope_order(order, previous_filters.category_ids)
                for order in self.orders.list_completed_in_period(date_from=previous_from, date_to=previous_to)
            )
            if scope
        )

        previous_finances = tuple(
            expense
            for expense in self.finance_expenses.list_in_period(date_from=previous_from, date_to=previous_to)
            if not previous_filters.finance_category_ids or expense.category_id in previous_filters.finance_category_ids
        )

        previous_standalone_materials = tuple(
            self.materials.list_in_period(
                date_from=previous_from,
                date_to=previous_to,
                category_ids=list(previous_filters.category_ids) if previous_filters.category_ids else None,
            )
        )

        first_completed_by_client = self.orders.get_first_completed_by_client_up_to(date_to=filters.date_to)

        return AnalyticsDataset(
            filters=filters,
            active_orders=active_orders,
            period_orders=period_orders,
            completed_orders=completed_orders,
            finances=finances,
            standalone_materials=standalone_materials,
            previous_completed_orders=previous_completed_orders,
            previous_finances=previous_finances,
            previous_standalone_materials=previous_standalone_materials,
            first_completed_by_client=first_completed_by_client,
        )





    def _scope_order(self, order: CrmOrder, category_ids: Iterable[int]) -> OrderScope | None:


        selected_category_ids = set(category_ids)


        service_scopes: list[ServiceScope] = []


        total_services = ZERO


        for service in order.services:


            category_id, category_name = self._resolve_service_category(service)


            if selected_category_ids and category_id not in selected_category_ids:


                continue


            service_scopes.append(


                ServiceScope(


                    service=service,


                    category_id=category_id,


                    category_name=category_name,


                    materials_total=ZERO,


                )


            )


            total_services += quantize_money(service.row_total)





        if not service_scopes and selected_category_ids:


            return None





        if not service_scopes:


            return OrderScope(


                order=order,


                services=tuple(),


                services_total=ZERO,


                materials_total=ZERO,


                discount_total=ZERO,


                amount_to_pay=ZERO,


                gross_profit=ZERO,


            )





        full_order_services_total = quantize_money(sum((quantize_money(service.row_total) for service in order.services), ZERO))


        if full_order_services_total == ZERO:


            discount_share = ZERO


        else:


            discount_share = quantize_money(
                OrderCalculationService.effective_discount_amount(order) * (total_services / full_order_services_total)
            )



        amount_to_pay = quantize_money(total_services - discount_share)


        gross_profit = quantize_money(amount_to_pay)


        return OrderScope(


            order=order,


            services=tuple(service_scopes),


            services_total=quantize_money(total_services),


            materials_total=ZERO,


            discount_total=discount_share,


            amount_to_pay=amount_to_pay,


            gross_profit=gross_profit,


        )





    def _resolve_service_category(self, service: CrmOrderService) -> tuple[int | None, str]:


        if service.service_catalog and service.service_catalog.category:


            category = service.service_catalog.category


            return category.id, category.name


        snapshot_name = (service.category_name_snapshot or "").strip()


        if snapshot_name:


            category = self.categories.get_by_name(snapshot_name)


            return category.id if category else None, snapshot_name


        return None, "Без категории"





    def _order_in_period(self, order: CrmOrder, filters: AnalyticsFilters) -> bool:


        if filters.order_statuses and order.status not in filters.order_statuses:


            return False


        primary_date = order.completed_at.date() if order.completed_at else order.created_at.date()


        return self._date_in_range(primary_date, filters.date_from, filters.date_to)





    @staticmethod


    def _matches_order_status_filter(order: CrmOrder, filters: AnalyticsFilters) -> bool:


        return not filters.order_statuses or order.status in filters.order_statuses





    @staticmethod


    def _date_in_range(value: date, date_from: date, date_to: date) -> bool:


        return date_from <= value <= date_to


    def _is_new_client_order(self, dataset: AnalyticsDataset, order: CrmOrder) -> bool:


        return dataset.first_completed_by_client.get(order.client_id) == order.id





    @staticmethod


    def _finance_to_read(expense: CrmFinanceExpense) -> AnalyticsLatestFinanceRead:


        return AnalyticsLatestFinanceRead(


            id=expense.id,


            expense_date=expense.expense_date,


            category_id=expense.category_id,


            category_name=expense.category.name,


            comment=expense.comment,


            amount=quantize_money(expense.amount),


            created_by_user_name=expense.created_by_user.full_name if expense.created_by_user else None,


        )





    def _unpaid_order_scopes(self, dataset: AnalyticsDataset) -> list[OrderScope]:


        scopes: list[OrderScope] = []


        for order in dataset.active_orders:


            if not self._is_active(order):


                continue


            if not self._matches_order_status_filter(order, dataset.filters):


                continue


            scope = self._scope_order(order, dataset.filters.category_ids)


            if scope is None:


                continue


            scopes.append(scope)


        return scopes





    def _build_overview_tab(self, dataset: AnalyticsDataset) -> AnalyticsOverviewTabRead:


        unpaid_order_scopes = self._unpaid_order_scopes(dataset)


        unpaid_total = quantize_money(sum((scope.amount_to_pay for scope in unpaid_order_scopes), ZERO))


        turnover = quantize_money(sum((scope.amount_to_pay for scope in dataset.completed_orders), ZERO))


        discounts = quantize_money(sum((scope.discount_total for scope in dataset.completed_orders), ZERO))


        standalone_materials_total = quantize_money(


            sum((quantize_money(expense.row_total) for expense in dataset.standalone_materials), ZERO)
        )


        materials = standalone_materials_total


        gross_profit = quantize_money(sum((scope.gross_profit for scope in dataset.completed_orders), ZERO) - standalone_materials_total)


        finance_total = quantize_money(sum((quantize_money(item.amount) for item in dataset.finances), ZERO))


        net_result = quantize_money(gross_profit - finance_total)


        completed_orders_count = len(dataset.completed_orders)


        average_check = safe_div(turnover, completed_orders_count)


        average_profit = safe_div(gross_profit, completed_orders_count)


        new_clients = sum(1 for scope in dataset.completed_orders if self._is_new_client_order(dataset, scope.order))


        repeat_clients = max(completed_orders_count - new_clients, 0)


        unique_client_ids = {scope.order.client_id for scope in dataset.completed_orders}


        repeat_client_ids = {scope.order.client_id for scope in dataset.completed_orders if not self._is_new_client_order(dataset, scope.order)}


        repeat_rate = percent(Decimal(len(repeat_client_ids)), Decimal(len(unique_client_ids))) if unique_client_ids else ZERO





        row_1 = [


            self._kpi("completed_orders", "Завершено заказов", int_to_str(completed_orders_count), "count", "Количество завершённых заказов за период"),


            self._kpi("turnover", "Оборот", money_to_str(turnover), "money", "Сумма поля К оплате по завершённым заказам"),


            self._kpi("discounts", "Скидки", money_to_str(discounts), "money", "Сумма скидок по завершённым заказам"),


            self._kpi("supplies", "Расходники", money_to_str(materials), "money", "Расходники заказа и отдельный журнал расходников"),


            self._kpi("gross_profit", "Валовая прибыль", money_to_str(gross_profit), "money", "Оборот минус все расходники"),


            self._kpi("finance_expenses", "Финансовые расходы", money_to_str(finance_total), "money", "Отдельные финансовые записи за период"),


            self._kpi("net_result", "Чистый результат", money_to_str(net_result), "money", "Валовая прибыль минус финансовые расходы", interactive=False),


        ]


        row_2 = [


            self._kpi("average_check", "Средний чек", money_to_str(average_check), "money", "Оборот, разделённый на число завершённых заказов", interactive=False),


            self._kpi("new_clients", "Новые клиенты", int_to_str(new_clients), "count", "Клиенты без завершённых заказов до текущего визита", "new_clients"),


            self._kpi("repeat_clients", "Повторные клиенты", int_to_str(repeat_clients), "count", "Клиенты, у которых уже были завершённые заказы", "repeat_clients"),


            self._kpi("return_rate", "Возврат клиентов %", money_to_str(repeat_rate), "percent", "Доля повторных клиентов среди всех клиентов периода", interactive=False),


            self._kpi("unpaid", "Неоплачено", money_to_str(unpaid_total), "money", "Сумма заказов в статусах В ожидании, В работе и Отложен"),


            self._kpi("average_profit", "Средняя прибыль на заказ", money_to_str(average_profit), "money", "Валовая прибыль, разделённая на число завершённых заказов", interactive=False),


        ]


        return AnalyticsOverviewTabRead(


            kpis_row_1=row_1,


            kpis_row_2=row_2,


            chart_groups=self._build_completed_chart_groups(dataset),


            waterfall=[


                AnalyticsWaterfallStepRead(key="turnover", label="Оборот", value=turnover),


                AnalyticsWaterfallStepRead(key="discounts", label="Минус скидки", value=-discounts),


                AnalyticsWaterfallStepRead(key="supplies", label="Минус расходники", value=-materials),


                AnalyticsWaterfallStepRead(key="gross_profit", label="Валовая прибыль", value=gross_profit),


                AnalyticsWaterfallStepRead(key="finance_expenses", label="Минус финансовые расходы", value=-finance_total),


                AnalyticsWaterfallStepRead(key="net_result", label="Чистый результат", value=net_result),


            ],


            top_categories=self._top_categories(dataset)[:5],


            top_services=self._top_services(dataset)[:5],


            top_clients=self._top_clients(dataset)[:5],


            latest_finances=[self._finance_to_read(expense) for expense in dataset.finances[:5]],


            insights=self._build_insights(dataset),


        )





    def _kpi(


        self,


        key: str,


        label: str,


        value: str,


        kind: str,


        caption: str,


        drilldown_metric: str | None = None,


        interactive: bool = True,


    ) -> AnalyticsKpiRead:


        return AnalyticsKpiRead(


            key=key,


            label=label,


            value=value,


            kind=kind,


            caption=caption,


            drilldown_metric=drilldown_metric or key,


            interactive=interactive,


        )





    def _build_completed_chart_groups(self, dataset: AnalyticsDataset) -> list[AnalyticsChartGroupRead]:


        return [


            AnalyticsChartGroupRead(group="day", points=self._group_completed_points(dataset, "day")),


            AnalyticsChartGroupRead(group="week", points=self._group_completed_points(dataset, "week")),


            AnalyticsChartGroupRead(group="month", points=self._group_completed_points(dataset, "month")),


        ]





    def _group_completed_points(self, dataset: AnalyticsDataset, group: str) -> list[AnalyticsChartPointRead]:


        buckets: dict[str, dict[str, Decimal | int | set[int]]] = {}


        for scope in dataset.completed_orders:


            order_date = scope.order.completed_at.date()


            period_key, label = make_period_bucket(order_date, group)


            bucket = buckets.setdefault(


                period_key,


                {


                    "label": label,


                    "turnover": ZERO,


                    "gross_profit": ZERO,


                    "orders_count": 0,


                    "new_clients": 0,


                    "repeat_clients": 0,


                },


            )


            bucket["turnover"] = quantize_money(bucket["turnover"] + scope.amount_to_pay)


            bucket["gross_profit"] = quantize_money(bucket["gross_profit"] + scope.gross_profit)


            bucket["orders_count"] = int(bucket["orders_count"]) + 1


            if self._is_new_client_order(dataset, scope.order):


                bucket["new_clients"] = int(bucket["new_clients"]) + 1


            else:


                bucket["repeat_clients"] = int(bucket["repeat_clients"]) + 1





        finance_by_key: dict[str, Decimal] = defaultdict(lambda: ZERO)


        for expense in dataset.finances:


            period_key, _ = make_period_bucket(expense.expense_date, group)


            finance_by_key[period_key] = quantize_money(finance_by_key[period_key] + quantize_money(expense.amount))


        standalone_materials_by_key: dict[str, Decimal] = defaultdict(lambda: ZERO)


        for expense in dataset.standalone_materials:
            period_key, _ = make_period_bucket(expense.expense_date, group)


            standalone_materials_by_key[period_key] = quantize_money(


                standalone_materials_by_key[period_key] + quantize_money(expense.row_total)


            )





        points: list[AnalyticsChartPointRead] = []


        for period_key in sorted(buckets):


            bucket = buckets[period_key]


            finance_value = finance_by_key.get(period_key, ZERO)


            standalone_materials_value = standalone_materials_by_key.get(period_key, ZERO)


            gross_profit = quantize_money(bucket["gross_profit"] - standalone_materials_value)


            points.append(


                AnalyticsChartPointRead(


                    period_key=period_key,


                    label=str(bucket["label"]),


                    turnover=quantize_money(bucket["turnover"]),


                    gross_profit=gross_profit,


                    net_result=quantize_money(gross_profit - finance_value),


                    finance_expenses=finance_value,


                    orders_count=int(bucket["orders_count"]),


                    new_clients=int(bucket["new_clients"]),


                    repeat_clients=int(bucket["repeat_clients"]),


                )


            )


        return points





    def _top_categories(self, dataset: AnalyticsDataset) -> list[AnalyticsTopCategoryRead]:


        buckets: dict[tuple[int | None, str], dict[str, Decimal | int]] = {}


        for scope in dataset.completed_orders:


            for service_scope in scope.services:


                key = (service_scope.category_id, service_scope.category_name)


                bucket = buckets.setdefault(key, {"orders": set(), "turnover": ZERO, "gross_profit": ZERO})


                bucket["orders"].add(scope.order.id)


                service_amount_to_pay = quantize_money(service_scope.service.row_total)


                bucket["turnover"] = quantize_money(bucket["turnover"] + service_amount_to_pay)


                bucket["gross_profit"] = quantize_money(bucket["gross_profit"] + quantize_money(service_scope.service.row_total))


        for expense in dataset.standalone_materials:
            category_name = expense.service_category.name if expense.service_category else "Без категории"


            key = (expense.service_category_id, category_name)


            bucket = buckets.setdefault(key, {"orders": set(), "turnover": ZERO, "gross_profit": ZERO})


            bucket["gross_profit"] = quantize_money(bucket["gross_profit"] - quantize_money(expense.row_total))





        rows = [


            AnalyticsTopCategoryRead(


                category_id=key[0],


                category_name=key[1],


                orders_count=len(bucket["orders"]),


                turnover=quantize_money(bucket["turnover"]),


                gross_profit=quantize_money(bucket["gross_profit"]),


            )


            for key, bucket in buckets.items()


        ]


        rows.sort(key=lambda item: (item.gross_profit, item.turnover, item.category_name), reverse=True)


        return rows





    def _top_services(self, dataset: AnalyticsDataset) -> list[AnalyticsTopServiceRead]:


        buckets: dict[tuple[str, str], dict[str, Decimal | int | list[int]]] = {}


        for scope in dataset.completed_orders:


            for service_scope in scope.services:


                key = (service_scope.service.service_name_snapshot, service_scope.category_name)


                bucket = buckets.setdefault(key, {"usage": 0, "revenue": ZERO, "gross_profit": ZERO, "orders": []})
                bucket["usage"] = int(bucket["usage"]) + service_scope.service.quantity


                bucket["revenue"] = quantize_money(bucket["revenue"] + quantize_money(service_scope.service.row_total))


                bucket["gross_profit"] = quantize_money(
                    bucket["gross_profit"] + quantize_money(service_scope.service.row_total)
                )
                bucket["orders"].append(scope.order.id)


        rows = [


            AnalyticsTopServiceRead(


                service_name=key[0],


                category_name=key[1],


                usage_count=int(bucket["usage"]),


                revenue=quantize_money(bucket["revenue"]),


                gross_profit=quantize_money(bucket["gross_profit"]),
            )


            for key, bucket in buckets.items()


        ]


        rows.sort(key=lambda item: (item.revenue, item.usage_count, item.service_name), reverse=True)


        return rows





    def _top_clients(self, dataset: AnalyticsDataset) -> list[AnalyticsTopClientRead]:


        buckets: dict[int, dict[str, Decimal | int | str]] = {}


        for scope in dataset.completed_orders:


            bucket = buckets.setdefault(


                scope.order.client_id,


                {


                    "name": scope.order.client.full_name,


                    "orders_count": 0,


                    "turnover": ZERO,


                    "gross_profit": ZERO,
                },


            )


            bucket["orders_count"] = int(bucket["orders_count"]) + 1


            bucket["turnover"] = quantize_money(bucket["turnover"] + scope.amount_to_pay)


            bucket["gross_profit"] = quantize_money(bucket["gross_profit"] + scope.gross_profit)
        rows = [


            AnalyticsTopClientRead(


                client_id=client_id,


                client_name=str(bucket["name"]),


                orders_count=int(bucket["orders_count"]),


                turnover=quantize_money(bucket["turnover"]),


                gross_profit=quantize_money(bucket["gross_profit"]),
            )


            for client_id, bucket in buckets.items()


        ]


        rows.sort(key=lambda item: (item.turnover, item.orders_count, item.client_name), reverse=True)


        return rows





    def _build_insights(self, dataset: AnalyticsDataset) -> list[AnalyticsInsightRead]:


        current_turnover = quantize_money(sum((scope.amount_to_pay for scope in dataset.completed_orders), ZERO))


        current_average = safe_div(current_turnover, len(dataset.completed_orders))


        previous_turnover = quantize_money(sum((scope.amount_to_pay for scope in dataset.previous_completed_orders), ZERO))


        previous_average = safe_div(previous_turnover, len(dataset.previous_completed_orders))


        current_finance = quantize_money(sum((quantize_money(item.amount) for item in dataset.finances), ZERO))


        previous_finance = quantize_money(sum((quantize_money(item.amount) for item in dataset.previous_finances), ZERO))


        top_categories = self._top_categories(dataset)


        top_clients = self._top_clients(dataset)


        return [


            AnalyticsInsightRead(


                key="average_check_delta",


                text=f"Средний чек {'вырос' if current_average >= previous_average else 'упал'}: {money_to_str(current_average)} ₽",


                tone="neutral",


            ),


            AnalyticsInsightRead(


                key="finance_delta",


                text=f"Финансовые расходы {'выросли' if current_finance >= previous_finance else 'упали'}: {money_to_str(current_finance)} ₽",


                tone="warning" if current_finance >= previous_finance else "success",


            ),


            AnalyticsInsightRead(


                key="top_category",


                text=f"Самая прибыльная категория: {top_categories[0].category_name}" if top_categories else "Нет прибыльных категорий за период",


                tone="success",


            ),


            AnalyticsInsightRead(


                key="bottom_category",


                text=f"Самая убыточная категория: {top_categories[-1].category_name}" if top_categories else "Нет убыточных категорий за период",


                tone="danger" if top_categories else "neutral",


            ),


            AnalyticsInsightRead(


                key="top_client",


                text=f"Клиент №1 по обороту: {top_clients[0].client_name}" if top_clients else "Нет клиентов с завершёнными заказами за период",
                tone="accent",


            ),


        ]





    def _build_orders_tab(self, dataset: AnalyticsDataset) -> AnalyticsOrdersTabRead:


        created_orders = [order for order in dataset.period_orders if self._date_in_range(order.created_at.date(), dataset.filters.date_from, dataset.filters.date_to)]


        completed_orders = list(dataset.completed_orders)


        unpaid_order_scopes = self._unpaid_order_scopes(dataset)


        in_progress_count = sum(1 for order in dataset.period_orders if self._is_in_progress(order))


        unpaid_count = len(unpaid_order_scopes)


        average_check = safe_div(


            quantize_money(sum((scope.amount_to_pay for scope in completed_orders), ZERO)),


            len(completed_orders),


        )


        completion_hours_values = [


            Decimal(str((scope.order.completed_at - scope.order.created_at).total_seconds() / 3600))


            for scope in completed_orders


            if scope.order.completed_at is not None


        ]


        average_completion_hours = safe_div(


            quantize_money(sum((quantize_money(value) for value in completion_hours_values), ZERO)),


            len(completion_hours_values),


        )


        kpis = [


            self._kpi("orders_created", "Создано", int_to_str(len(created_orders)), "count", "Заказы, созданные в период"),


            self._kpi("completed_orders", "Завершено", int_to_str(len(completed_orders)), "count", "Количество завершённых заказов за период"),


            self._kpi("orders_in_progress", "В работе", int_to_str(in_progress_count), "count", "Заказы со статусом in_progress"),


            self._kpi("orders_overdue", "Просрочено", "0", "count", "Сроки заказа не ведутся в текущей модели", interactive=False),


            self._kpi("orders_unpaid", "Неоплачено", int_to_str(unpaid_count), "count", "Заказы в статусах В ожидании, В работе и Отложен"),


            self._kpi("average_check", "Средний чек", money_to_str(average_check), "money", "Оборот, разделённый на число завершённых заказов", interactive=False),


            self._kpi("average_completion_hours", "Среднее время выполнения", money_to_str(average_completion_hours), "hours", "Среднее между созданием и завершением", interactive=False),


        ]


        rows = sorted((self._to_order_row(scope) for scope in completed_orders), key=lambda row: (row.date, row.id), reverse=True)


        return AnalyticsOrdersTabRead(


            kpis=kpis,


            chart_groups=self._build_order_status_chart_groups(dataset),


            funnel=[


                AnalyticsFunnelStepRead(key="created", label="Создан", value=len(created_orders)),


                AnalyticsFunnelStepRead(key="in_progress", label="В работе", value=in_progress_count),


                AnalyticsFunnelStepRead(key="completed", label="Завершён", value=len(completed_orders)),


                AnalyticsFunnelStepRead(key="paid", label="Оплачен", value=0),


            ],


            rows=rows,


        )





    def _to_order_row(self, scope: OrderScope) -> AnalyticsOrdersRowRead:


        categories = sorted({service_scope.category_name for service_scope in scope.services})


        completion_hours: Decimal | None = None


        if scope.order.completed_at is not None:


            completion_hours = quantize_money(


                Decimal(str((scope.order.completed_at - scope.order.created_at).total_seconds() / 3600))


            )


        return AnalyticsOrdersRowRead(


            id=scope.order.id,


            date=scope.order.completed_at or scope.order.created_at,


            client_id=scope.order.client_id,


            client_name=scope.order.client.full_name,


            vehicle_id=scope.order.vehicle_id,


            vehicle_label=scope.order.vehicle.plate_number_display,


            category_names=categories,


            services_total=scope.services_total,


            materials_total=scope.materials_total,


            discount_total=scope.discount_total,


            amount_to_pay=scope.amount_to_pay,


            gross_profit=scope.gross_profit,


            status=scope.order.status,


            employee_name=None,


            completed_at=scope.order.completed_at,


            completion_hours=completion_hours,


        )





    def _build_order_status_chart_groups(self, dataset: AnalyticsDataset) -> list[AnalyticsChartGroupRead]:


        return [


            AnalyticsChartGroupRead(group="day", points=self._group_order_counts(dataset, "day")),


            AnalyticsChartGroupRead(group="week", points=self._group_order_counts(dataset, "week")),


        ]





    def _group_order_counts(self, dataset: AnalyticsDataset, group: str) -> list[AnalyticsChartPointRead]:


        buckets: dict[str, tuple[str, int]] = {}


        for order in dataset.period_orders:


            key, label = make_period_bucket(order.created_at.date(), group)


            current = buckets.get(key)


            buckets[key] = (label, (current[1] if current else 0) + 1)


        return [


            AnalyticsChartPointRead(period_key=key, label=label, orders_count=value)


            for key, (label, value) in sorted(buckets.items())


        ]





    def _build_services_tab(self, dataset: AnalyticsDataset) -> AnalyticsServicesTabRead:


        category_rows = self._build_service_category_rows(dataset)


        service_rows = self._build_service_rows(dataset)


        return AnalyticsServicesTabRead(category_rows=category_rows, service_rows=service_rows)





    def _build_service_category_rows(self, dataset: AnalyticsDataset) -> list[AnalyticsServiceCategoryRowRead]:


        buckets: dict[tuple[int | None, str], dict[str, object]] = {}


        previous_buckets: dict[tuple[int | None, str], Decimal] = defaultdict(lambda: ZERO)





        for scope in dataset.previous_completed_orders:


            for service_scope in scope.services:


                key = (service_scope.category_id, service_scope.category_name)


                previous_buckets[key] = quantize_money(previous_buckets[key] + quantize_money(service_scope.service.row_total))





        for scope in dataset.completed_orders:


            for service_scope in scope.services:


                key = (service_scope.category_id, service_scope.category_name)


                bucket = buckets.setdefault(


                    key,


                    {


                        "orders": set(),


                        "services_total": ZERO,


                        "materials_total": ZERO,


                        "discount_total": ZERO,


                        "amount_to_pay": ZERO,


                        "gross_profit": ZERO,


                        "top_services": defaultdict(lambda: {"usage": 0, "revenue": ZERO, "gross_profit": ZERO}),
                        "top_clients": defaultdict(
                            lambda: {"name": "", "orders": 0, "turnover": ZERO, "gross_profit": ZERO}
                        ),
                    },


                )


                bucket["orders"].add(scope.order.id)


                bucket["services_total"] = quantize_money(bucket["services_total"] + quantize_money(service_scope.service.row_total))


                bucket["amount_to_pay"] = quantize_money(bucket["amount_to_pay"] + quantize_money(service_scope.service.row_total))


                bucket["gross_profit"] = quantize_money(bucket["gross_profit"] + quantize_money(service_scope.service.row_total))





                service_bucket = bucket["top_services"][service_scope.service.service_name_snapshot]


                service_bucket["usage"] += service_scope.service.quantity


                service_bucket["revenue"] = quantize_money(service_bucket["revenue"] + quantize_money(service_scope.service.row_total))


                service_bucket["gross_profit"] = quantize_money(
                    service_bucket["gross_profit"] + quantize_money(service_scope.service.row_total)
                )



                client_bucket = bucket["top_clients"][scope.order.client_id]


                client_bucket["name"] = scope.order.client.full_name


                client_bucket["orders"] += 1


                client_bucket["turnover"] = quantize_money(client_bucket["turnover"] + scope.amount_to_pay)


                client_bucket["gross_profit"] = quantize_money(client_bucket["gross_profit"] + scope.gross_profit)
        for expense in dataset.standalone_materials:
            category_name = expense.service_category.name if expense.service_category else "Без категории"


            key = (expense.service_category_id, category_name)


            bucket = buckets.setdefault(


                key,


                {


                    "orders": set(),


                    "services_total": ZERO,


                    "materials_total": ZERO,


                    "discount_total": ZERO,


                    "amount_to_pay": ZERO,


                    "gross_profit": ZERO,


                    "top_services": defaultdict(lambda: {"usage": 0, "revenue": ZERO, "gross_profit": ZERO}),
                    "top_clients": defaultdict(
                        lambda: {"name": "", "orders": 0, "turnover": ZERO, "gross_profit": ZERO}
                    ),
                },


            )


            bucket["materials_total"] = quantize_money(bucket["materials_total"] + quantize_money(expense.row_total))


            bucket["gross_profit"] = quantize_money(bucket["gross_profit"] - quantize_money(expense.row_total))


        for expense in dataset.previous_standalone_materials:
            category_name = expense.service_category.name if expense.service_category else "Без категории"


            key = (expense.service_category_id, category_name)


            previous_buckets[key] = quantize_money(previous_buckets[key] - quantize_money(expense.row_total))





        rows: list[AnalyticsServiceCategoryRowRead] = []


        for (category_id, category_name), bucket in buckets.items():


            services_total = quantize_money(bucket["services_total"])


            materials_total = quantize_money(bucket["materials_total"])


            amount_to_pay = quantize_money(bucket["amount_to_pay"])


            gross_profit = quantize_money(bucket["gross_profit"])


            previous_value = previous_buckets[(category_id, category_name)]


            delta = ZERO if previous_value == ZERO else quantize_money(((services_total - previous_value) / previous_value) * HUNDRED)


            top_services = [


                AnalyticsTopServiceRead(


                    service_name=service_name,


                    category_name=category_name,


                    usage_count=service_bucket["usage"],


                    revenue=quantize_money(service_bucket["revenue"]),


                    gross_profit=quantize_money(service_bucket["gross_profit"]),
                )


                for service_name, service_bucket in bucket["top_services"].items()


            ]


            top_services.sort(key=lambda item: (item.revenue, item.usage_count, item.service_name), reverse=True)


            top_clients = [


                AnalyticsTopClientRead(


                    client_id=client_id,


                    client_name=client_bucket["name"],


                    orders_count=client_bucket["orders"],


                    turnover=quantize_money(client_bucket["turnover"]),


                    gross_profit=quantize_money(client_bucket["gross_profit"]),
                )


                for client_id, client_bucket in bucket["top_clients"].items()


            ]


            top_clients.sort(key=lambda item: (item.turnover, item.orders_count, item.client_name), reverse=True)


            rows.append(


                AnalyticsServiceCategoryRowRead(


                    category_id=category_id,


                    category_name=category_name,


                    orders_count=len(bucket["orders"]),


                    services_total=services_total,


                    materials_total=materials_total,


                    discount_total=ZERO,


                    amount_to_pay=amount_to_pay,


                    gross_profit=gross_profit,


                    margin_percent=percent(gross_profit, amount_to_pay),


                    average_check=safe_div(amount_to_pay, len(bucket["orders"])),


                    dynamics_delta_percent=delta,


                    top_services=top_services[:5],


                    top_clients=top_clients[:5],


                )


            )


        rows.sort(key=lambda item: (item.gross_profit, item.amount_to_pay, item.category_name), reverse=True)


        return rows





    def _build_service_rows(self, dataset: AnalyticsDataset) -> list[AnalyticsServiceRowRead]:


        buckets: dict[tuple[str, int | None, str], dict[str, object]] = {}


        for scope in dataset.completed_orders:


            for service_scope in scope.services:


                key = (


                    service_scope.service.service_name_snapshot,


                    service_scope.category_id,


                    service_scope.category_name,


                )


                bucket = buckets.setdefault(


                    key,


                        {"usage": 0, "revenue": ZERO, "gross_profit": ZERO, "prices": [], "recent_order_ids": []},
                )


                bucket["usage"] += service_scope.service.quantity


                bucket["revenue"] = quantize_money(bucket["revenue"] + quantize_money(service_scope.service.row_total))


                bucket["gross_profit"] = quantize_money(
                    bucket["gross_profit"] + quantize_money(service_scope.service.row_total)
                )
                bucket["prices"].append(quantize_money(service_scope.service.unit_price))


                bucket["recent_order_ids"].append(scope.order.id)





        rows = [


            AnalyticsServiceRowRead(


                service_name=key[0],


                category_id=key[1],


                category_name=key[2],


                usage_count=bucket["usage"],


                revenue=quantize_money(bucket["revenue"]),


                average_price=safe_div(quantize_money(sum(bucket["prices"], ZERO)), len(bucket["prices"])),


                min_price=min(bucket["prices"]) if bucket["prices"] else ZERO,


                max_price=max(bucket["prices"]) if bucket["prices"] else ZERO,


                gross_profit=quantize_money(bucket["gross_profit"]),
                recent_order_ids=list(dict.fromkeys(reversed(bucket["recent_order_ids"])))[:5],


            )


            for key, bucket in buckets.items()


        ]


        rows.sort(key=lambda item: (item.revenue, item.usage_count, item.service_name), reverse=True)


        return rows





    def _build_supplies_tab(self, dataset: AnalyticsDataset) -> AnalyticsSuppliesTabRead:


        rows: list[AnalyticsSupplyRowRead] = []


        material_totals: dict[str, Decimal] = defaultdict(lambda: ZERO)


        order_totals: dict[int, Decimal] = defaultdict(lambda: ZERO)


        category_totals: dict[tuple[int | None, str], Decimal] = defaultdict(lambda: ZERO)


        legacy_id_offset = 1_000_000


        for expense in dataset.standalone_materials:
            category_name = expense.service_category.name if expense.service_category else "Без категории"


            rows.append(


                AnalyticsSupplyRowRead(


                    id=legacy_id_offset + expense.id,


                    date=datetime.combine(expense.expense_date, datetime.min.time()),


                    order_id=None,


                    client_id=None,


                    client_name=None,


                    vehicle_id=None,


                    vehicle_label=None,


                    category_id=expense.service_category_id,


                    category_name=category_name,


                    material_name=expense.material_name,


                    quantity=expense.quantity,


                    unit_price=quantize_money(expense.unit_price),


                    amount=quantize_money(expense.row_total),


                    created_by_name=None,


                )


            )


            material_totals[expense.material_name] = quantize_money(material_totals[expense.material_name] + quantize_money(expense.row_total))


            category_totals[(expense.service_category_id, category_name)] = quantize_money(


                category_totals[(expense.service_category_id, category_name)] + quantize_money(expense.row_total)


            )





        total_supplies = quantize_money(sum((row.amount for row in rows), ZERO))


        turnover = quantize_money(sum((scope.amount_to_pay for scope in dataset.completed_orders), ZERO))


        max_order_id = max(order_totals, key=order_totals.get) if order_totals else None


        max_category_key = max(category_totals, key=category_totals.get) if category_totals else None


        kpis = [


            self._kpi("supplies_total", "Общая сумма расходников", money_to_str(total_supplies), "money", "Сумма всех расходников по завершённым заказам"),


            self._kpi("supplies_average", "Средний расходник на заказ", money_to_str(safe_div(total_supplies, len(dataset.completed_orders))), "money", "Расходники, разделённые на число завершённых заказов", interactive=False),


            self._kpi("supplies_share", "Доля расходников в обороте", money_to_str(percent(total_supplies, turnover)), "percent", "Расходники / оборот", interactive=False),


            self._kpi("supplies_max_order", "Заказ с максимумом расходников", int_to_str(max_order_id or 0), "count", "ID заказа с максимальной суммой расходников", interactive=False),


            self._kpi("supplies_max_category", "Категория с максимумом расходников", max_category_key[1] if max_category_key else "Нет данных", "text", "Категория с максимальной суммой расходников", interactive=False),


        ]


        rows.sort(key=lambda row: (row.date, row.id), reverse=True)


        return AnalyticsSuppliesTabRead(


            kpis=kpis,


            rows=rows,


            top_materials=self._top_named_amounts(material_totals),


            top_orders=[


                AnalyticsTopNamedAmountRead(name=f"Заказ #{order_id}", amount=amount, related_id=order_id)


                for order_id, amount in sorted(order_totals.items(), key=lambda item: item[1], reverse=True)[:5]


            ],


            top_categories=[


                AnalyticsTopNamedAmountRead(name=key[1], amount=value, related_id=key[0])


                for key, value in sorted(category_totals.items(), key=lambda item: item[1], reverse=True)[:5]


            ],


        )





    def _build_finances_tab(self, dataset: AnalyticsDataset) -> AnalyticsFinancesTabRead:


        total = quantize_money(sum((quantize_money(expense.amount) for expense in dataset.finances), ZERO))


        gross_profit = quantize_money(


            sum((scope.gross_profit for scope in dataset.completed_orders), ZERO)


            - sum((quantize_money(expense.row_total) for expense in dataset.standalone_materials), ZERO)
        )


        largest_category = self._largest_finance_category(dataset.finances)


        largest_expense = max((quantize_money(expense.amount) for expense in dataset.finances), default=ZERO)


        category_rows = self._finance_category_rows(dataset)


        kpis = [


            self._kpi("finance_expenses", "Всего финансовых расходов", money_to_str(total), "money", "Сумма записей раздела Финансы"),


            self._kpi("finance_average_day", "Средний расход в день", money_to_str(safe_div(total, daterange_days(dataset.filters.date_from, dataset.filters.date_to))), "money", "Финансовые расходы / число дней", interactive=False),


            self._kpi("finance_largest_category", "Крупнейшая категория расходов", largest_category, "text", "Категория с максимальной суммой расходов", interactive=False),


            self._kpi("finance_largest_expense", "Крупнейший расход", money_to_str(largest_expense), "money", "Максимальная отдельная финансовая запись", interactive=False),


            self._kpi("finance_share", "Доля финансов от валовой прибыли", money_to_str(percent(total, gross_profit)), "percent", "Финансовые расходы / валовая прибыль", interactive=False),


            self._kpi("finance_net_result", "Чистый результат после финансов", money_to_str(quantize_money(gross_profit - total)), "money", "Валовая прибыль минус финансовые расходы", interactive=False),


        ]


        return AnalyticsFinancesTabRead(


            kpis=kpis,


            chart_groups=self._build_finance_chart_groups(dataset),


            category_rows=category_rows,


            rows=[self._finance_to_read(expense) for expense in dataset.finances],


        )





    def _finance_category_rows(self, dataset: AnalyticsDataset) -> list[AnalyticsFinanceCategoryRowRead]:


        total = quantize_money(sum((quantize_money(expense.amount) for expense in dataset.finances), ZERO))


        buckets: dict[int, list[CrmFinanceExpense]] = defaultdict(list)


        for expense in dataset.finances:


            buckets[expense.category_id].append(expense)


        rows: list[AnalyticsFinanceCategoryRowRead] = []


        for category_expenses in buckets.values():


            category_expenses.sort(key=lambda item: (item.expense_date, item.created_at, item.id), reverse=True)


            amount = quantize_money(sum((quantize_money(item.amount) for item in category_expenses), ZERO))


            rows.append(


                AnalyticsFinanceCategoryRowRead(


                    category_id=category_expenses[0].category_id,


                    category_name=category_expenses[0].category.name,


                    amount=amount,


                    share_percent=percent(amount, total),


                    latest_expenses=[self._finance_to_read(item) for item in category_expenses[:5]],


                )


            )


        rows.sort(key=lambda item: (item.amount, item.category_name), reverse=True)


        return rows





    def _build_finance_chart_groups(self, dataset: AnalyticsDataset) -> list[AnalyticsChartGroupRead]:


        return [


            AnalyticsChartGroupRead(group="day", points=self._group_finance_points(dataset.finances, "day")),


            AnalyticsChartGroupRead(group="week", points=self._group_finance_points(dataset.finances, "week")),


            AnalyticsChartGroupRead(group="month", points=self._group_finance_points(dataset.finances, "month")),


        ]





    def _group_finance_points(self, expenses: Iterable[CrmFinanceExpense], group: str) -> list[AnalyticsChartPointRead]:


        buckets: dict[str, tuple[str, Decimal]] = {}


        for expense in expenses:


            key, label = make_period_bucket(expense.expense_date, group)


            current = buckets.get(key)


            total = quantize_money((current[1] if current else ZERO) + quantize_money(expense.amount))


            buckets[key] = (label, total)


        return [


            AnalyticsChartPointRead(period_key=key, label=label, finance_expenses=value)


            for key, (label, value) in sorted(buckets.items())


        ]





    def _build_clients_tab(self, dataset: AnalyticsDataset) -> AnalyticsClientsTabRead:


        rows = self._build_client_rows(dataset)


        new_clients = sum(1 for row in rows if row.segment == "new")


        repeat_clients = sum(1 for row in rows if row.orders_count > 1)


        return_rate = percent(Decimal(repeat_clients), Decimal(len(rows))) if rows else ZERO


        average_check = safe_div(


            quantize_money(sum((row.amount_to_pay for row in rows), ZERO)),


            sum(row.orders_count for row in rows),


        )


        kpis = [


            self._kpi("new_clients", "Новые клиенты", int_to_str(new_clients), "count", "Клиенты без завершённых заказов до текущего визита"),


            self._kpi("repeat_clients", "Повторные клиенты", int_to_str(repeat_clients), "count", "Клиенты, у которых был хотя бы один завершённый заказ раньше"),


            self._kpi("return_rate", "Возврат %", money_to_str(return_rate), "percent", "Доля повторных клиентов среди всех клиентов"),


            self._kpi("average_check", "Средний чек", money_to_str(average_check), "money", "Оборот, разделённый на число завершённых заказов", interactive=False),


            self._kpi("ltv", "Ценность клиентов", money_to_str(quantize_money(sum((row.ltv for row in rows), ZERO))), "money", "Суммарная ценность клиентов из таблицы", interactive=False),


            self._kpi("inactive_clients", "Клиенты без визитов 30 / 60 / 90 дней", f"{self._inactive_count(rows, 30)} / {self._inactive_count(rows, 60)} / {self._inactive_count(rows, 90)}", "text", "Количество клиентов без визитов по порогам", interactive=False),


        ]


        return AnalyticsClientsTabRead(


            kpis=kpis,


            chart_groups=self._build_client_chart_groups(dataset),


            rows=rows,


            segments=self._build_client_segments(rows),


        )





    def _build_client_rows(self, dataset: AnalyticsDataset) -> list[AnalyticsClientRowRead]:


        vip_ids = {client.client_id for client in self._top_clients(dataset)[:3]}


        buckets: dict[int, list[OrderScope]] = defaultdict(list)


        for scope in dataset.completed_orders:


            buckets[scope.order.client_id].append(scope)


        rows: list[AnalyticsClientRowRead] = []


        now = app_now_naive()


        for client_id, scopes in buckets.items():


            scopes.sort(key=lambda item: (item.order.completed_at, item.order.id), reverse=True)


            total_amount = quantize_money(sum((scope.amount_to_pay for scope in scopes), ZERO))


            total_profit = quantize_money(sum((scope.gross_profit for scope in scopes), ZERO))


            services_counter: dict[str, int] = defaultdict(int)


            for scope in scopes:


                for service_scope in scope.services:


                    services_counter[service_scope.service.service_name_snapshot] += service_scope.service.quantity


            favorite_services = [name for name, _ in sorted(services_counter.items(), key=lambda item: (-item[1], item[0]))[:3]]


            last_visit = scopes[0].order.completed_at


            inactive_days = (now.date() - last_visit.date()).days if last_visit else 0


            if inactive_days >= 90:


                activity_status = "90+ дней без визита"


            elif inactive_days >= 60:


                activity_status = "60+ дней без визита"


            elif inactive_days >= 30:


                activity_status = "30+ дней без визита"


            else:


                activity_status = "Активный"


            first_scope = min(scopes, key=lambda item: (item.order.completed_at, item.order.id))


            if client_id in vip_ids:


                segment = "vip"


            elif inactive_days >= 90:


                segment = "lost"


            elif self._is_new_client_order(dataset, first_scope.order) and len(scopes) == 1:


                segment = "new"


            elif len(scopes) >= 3:


                segment = "regular"


            else:


                segment = "single"


            rows.append(


                AnalyticsClientRowRead(


                    client_id=client_id,


                    client_name=scopes[0].order.client.full_name,


                    phone=scopes[0].order.client.phone_display,


                    orders_count=len(scopes),


                    amount_to_pay=total_amount,


                    gross_profit=total_profit,


                    average_check=safe_div(total_amount, len(scopes)),


                    last_visit=last_visit,


                    favorite_services=favorite_services,


                    activity_status=activity_status,


                    ltv=total_amount,


                    segment=segment,


                )


            )


        rows.sort(key=lambda item: (item.amount_to_pay, item.orders_count, item.client_name), reverse=True)


        return rows





    def _build_client_chart_groups(self, dataset: AnalyticsDataset) -> list[AnalyticsChartGroupRead]:


        return [AnalyticsChartGroupRead(group="month", points=self._group_completed_points(dataset, "month"))]





    def _build_client_segments(self, rows: list[AnalyticsClientRowRead]) -> list[AnalyticsSegmentRead]:


        mapping = {


            "vip": "Ключевые",


            "regular": "Постоянные",


            "new": "Новые",


            "single": "Разовые",


            "lost": "Потерянные",


        }


        counts: dict[str, int] = defaultdict(int)


        for row in rows:


            counts[row.segment] += 1


        return [


            AnalyticsSegmentRead(key=key, label=label, value=counts.get(key, 0))


            for key, label in mapping.items()


        ]





    @staticmethod


    def _inactive_count(rows: list[AnalyticsClientRowRead], threshold_days: int) -> int:


        label = f"{threshold_days}+ дней без визита"


        return sum(1 for row in rows if row.activity_status == label or row.activity_status.startswith(str(threshold_days)))





    @staticmethod


    def _top_named_amounts(buckets: dict[str, Decimal]) -> list[AnalyticsTopNamedAmountRead]:


        return [


            AnalyticsTopNamedAmountRead(name=name, amount=amount)


            for name, amount in sorted(buckets.items(), key=lambda item: item[1], reverse=True)[:5]


        ]





    @staticmethod


    def _largest_finance_category(expenses: Iterable[CrmFinanceExpense]) -> str:


        buckets: dict[str, Decimal] = defaultdict(lambda: ZERO)


        for expense in expenses:


            buckets[expense.category.name] = quantize_money(buckets[expense.category.name] + quantize_money(expense.amount))


        if not buckets:


            return "Нет данных"


        return max(buckets.items(), key=lambda item: item[1])[0]





    def _build_drilldown_rows(


        self,


        dataset: AnalyticsDataset,


        *,


        metric: str,


        category_id: int | None,


        service_name: str | None,


        client_id: int | None,


    ) -> tuple[str, str | None, list[AnalyticsDrilldownRowRead]]:


        if metric in {"completed_orders", "turnover", "discounts", "gross_profit"}:


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="order",


                    entity_id=scope.order.id,


                    title=f"Заказ #{scope.order.id}",


                    subtitle=f"{scope.order.client.full_name} • {scope.order.vehicle.plate_number_display}",


                    date=scope.order.completed_at,


                    amount=scope.amount_to_pay if metric != "discounts" else scope.discount_total,


                    gross_profit=scope.gross_profit,


                    status=scope.order.status,


                    client_id=scope.order.client_id,


                    vehicle_id=scope.order.vehicle_id,


                    order_id=scope.order.id,


                )


                for scope in dataset.completed_orders


            ]


            rows.sort(key=lambda row: (row.date, row.entity_id or 0), reverse=True)


            return "Список заказов", "Завершённые заказы за выбранный период", rows


        if metric in {"unpaid", "orders_unpaid"}:


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="order",


                    entity_id=scope.order.id,


                    title=f"Заказ #{scope.order.id}",


                    subtitle=f"{scope.order.client.full_name} • {scope.order.vehicle.plate_number_display}",


                    date=scope.order.created_at,


                    amount=scope.amount_to_pay,


                    gross_profit=scope.gross_profit,


                    status=scope.order.status,


                    client_id=scope.order.client_id,


                    vehicle_id=scope.order.vehicle_id,


                    order_id=scope.order.id,


                )


                for scope in self._unpaid_order_scopes(dataset)


            ]


            rows.sort(key=lambda row: (row.date, row.entity_id or 0), reverse=True)


            return "Неоплаченные заказы", "Заказы в статусах В ожидании, В работе и Отложен", rows


        if metric in {"supplies", "supplies_total"}:


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="supply",


                    entity_id=row.id,


                    title=row.material_name,


                    subtitle=f"Заказ #{row.order_id} • {row.category_name}",


                    date=row.date,


                    amount=row.amount,


                    client_id=row.client_id,


                    vehicle_id=row.vehicle_id,


                    order_id=row.order_id,


                )


                for row in self._build_supplies_tab(dataset).rows


            ]


            return "Список расходников", "Расходники по завершённым заказам", rows


        if metric in {"finance_expenses", "finance_expenses_total"}:


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="finance",


                    entity_id=expense.id,


                    title=expense.category.name,


                    subtitle=expense.comment or "Без комментария",


                    date=datetime.combine(expense.expense_date, datetime.min.time()),


                    amount=quantize_money(expense.amount),


                )


                for expense in dataset.finances


            ]


            return "Финансовые расходы", "Финансовые записи за выбранный период", rows


        if metric == "new_clients":


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="client",


                    entity_id=scope.order.client_id,


                    title=scope.order.client.full_name,


                    subtitle=scope.order.client.phone_display,


                    date=scope.order.completed_at,


                    amount=scope.amount_to_pay,


                    client_id=scope.order.client_id,


                    vehicle_id=scope.order.vehicle_id,


                    order_id=scope.order.id,


                )


                for scope in dataset.completed_orders


                if self._is_new_client_order(dataset, scope.order)


            ]


            return "Новые клиенты", "Клиенты без завершённых заказов до текущего визита", rows


        if metric == "repeat_clients":


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="client",


                    entity_id=scope.order.client_id,


                    title=scope.order.client.full_name,


                    subtitle=scope.order.client.phone_display,


                    date=scope.order.completed_at,


                    amount=scope.amount_to_pay,


                    client_id=scope.order.client_id,


                    vehicle_id=scope.order.vehicle_id,


                    order_id=scope.order.id,


                )


                for scope in dataset.completed_orders


                if not self._is_new_client_order(dataset, scope.order)


            ]


            return "Повторные клиенты", "Клиенты, у которых были завершённые заказы до текущего визита", rows


        if metric == "category" and category_id is not None:


            rows: list[AnalyticsDrilldownRowRead] = []


            for scope in dataset.completed_orders:


                for service_scope in scope.services:


                    if service_scope.category_id != category_id:


                        continue


                    rows.append(


                        AnalyticsDrilldownRowRead(


                            entity_type="service",


                            entity_id=service_scope.service.id,


                            title=service_scope.service.service_name_snapshot,


                            subtitle=f"Заказ #{scope.order.id} • {scope.order.client.full_name}",


                            date=scope.order.completed_at,


                            amount=quantize_money(service_scope.service.row_total),


                            gross_profit=quantize_money(service_scope.service.row_total),


                            client_id=scope.order.client_id,


                            vehicle_id=scope.order.vehicle_id,


                            order_id=scope.order.id,


                        )


                    )


            return "Категория услуг", "Заказы и услуги выбранной категории", rows


        if metric == "service" and service_name:


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="service",


                    entity_id=service_scope.service.id,


                    title=scope.order.client.full_name,


                    subtitle=f"Заказ #{scope.order.id} • {scope.order.vehicle.plate_number_display}",


                    date=scope.order.completed_at,


                    amount=quantize_money(service_scope.service.row_total),


                    gross_profit=quantize_money(service_scope.service.row_total),


                    client_id=scope.order.client_id,


                    vehicle_id=scope.order.vehicle_id,


                    order_id=scope.order.id,


                )


                for scope in dataset.completed_orders


                for service_scope in scope.services


                if service_scope.service.service_name_snapshot == service_name


            ]


            return f"Услуга: {service_name}", "Заказы с выбранной услугой", rows


        if metric == "client" and client_id is not None:


            rows = [


                AnalyticsDrilldownRowRead(


                    entity_type="order",


                    entity_id=scope.order.id,


                    title=f"Заказ #{scope.order.id}",


                    subtitle=scope.order.vehicle.plate_number_display,


                    date=scope.order.completed_at,


                    amount=scope.amount_to_pay,


                    gross_profit=scope.gross_profit,


                    status=scope.order.status,


                    client_id=scope.order.client_id,


                    vehicle_id=scope.order.vehicle_id,


                    order_id=scope.order.id,


                )


                for scope in dataset.completed_orders


                if scope.order.client_id == client_id


            ]


            return "Клиент", "Заказы клиента за выбранный период", rows


        raise AppError(code="invalid_metric", message="Не удалось построить детализацию", status_code=400)








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








def previous_period(date_from: date, date_to: date) -> tuple[date, date]:


    period_length = (date_to - date_from).days + 1


    previous_to = date_from - timedelta(days=1)


    previous_from = previous_to - timedelta(days=period_length - 1)


    return previous_from, previous_to








def quarter_period(reference_date: date) -> tuple[date, date]:


    quarter_index = (reference_date.month - 1) // 3


    start_month = quarter_index * 3 + 1


    period_start = reference_date.replace(month=start_month, day=1)


    if start_month == 10:


        next_start = reference_date.replace(year=reference_date.year + 1, month=1, day=1)


    else:


        next_start = reference_date.replace(month=start_month + 3, day=1)


    return period_start, next_start - timedelta(days=1)








def resolve_analytics_period(


    *,


    date_from: date | None,


    date_to: date | None,


    period_preset: str = "working_month",


    working_month_start_day: int = 25,


) -> tuple[date, date]:


    if date_from and date_to:


        return date_from, date_to


    today = app_now_naive().date()


    if period_preset == "today":


        return today, today


    if period_preset == "yesterday":


        yesterday = today - timedelta(days=1)


        return yesterday, yesterday


    if period_preset == "7_days":


        return today - timedelta(days=6), today


    if period_preset == "30_days":


        return today - timedelta(days=29), today


    if period_preset == "previous_working_month":


        current_start, _ = get_default_analytics_period(today, working_month_start_day=working_month_start_day)


        previous_reference = current_start - timedelta(days=1)


        return get_default_analytics_period(previous_reference, working_month_start_day=working_month_start_day)


    if period_preset == "quarter":


        return quarter_period(today)


    return get_default_analytics_period(today, working_month_start_day=working_month_start_day)








def make_period_bucket(value: date, group: str) -> tuple[str, str]:


    if group == "month":


        key = value.strftime("%Y-%m")


        return key, value.strftime("%m.%Y")


    if group == "week":


        iso_year, iso_week, _ = value.isocalendar()


        week_start = value - timedelta(days=value.weekday())


        week_end = week_start + timedelta(days=6)


        return f"{iso_year}-W{iso_week:02d}", f"{week_start.strftime('%d.%m')} - {week_end.strftime('%d.%m')}"


    return value.isoformat(), value.strftime("%d.%m")


