from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from app.crm.schemas.common import CrmSchema


class AnalyticsOverviewRead(CrmSchema):
    completed_orders_count: int
    turnover: Decimal
    discount_total: Decimal
    materials_total: Decimal
    profit: Decimal
    average_check: Decimal
    new_clients: int
    repeat_clients: int


class AnalyticsServiceBreakdownRead(CrmSchema):
    service_name: str
    quantity_total: int
    orders_count: int
    service_total: Decimal


class AnalyticsCategoryRead(CrmSchema):
    category_id: int | None
    category_name: str
    completed_orders_count: int
    service_total: Decimal
    materials_total: Decimal
    profit: Decimal
    services_used: list[AnalyticsServiceBreakdownRead]


class AnalyticsFilterEchoRead(CrmSchema):
    date_from: date | None
    date_to: date | None
    category_ids: list[int]
    order_statuses: list[str] = []
    finance_category_ids: list[int] = []
    period_preset: str = "working_month"


class AnalyticsCategoryOrderRead(CrmSchema):
    id: int
    client_id: int
    client_full_name: str
    status: str
    vehicle_id: int
    vehicle_plate_number: str
    category_service_total: Decimal


class AnalyticsCategoryOrdersRead(CrmSchema):
    filter: AnalyticsFilterEchoRead
    service_total: Decimal
    materials_total: Decimal
    profit: Decimal
    orders: list[AnalyticsCategoryOrderRead]
    generated_at: datetime


class AnalyticsKpiRead(CrmSchema):
    key: str
    label: str
    value: str
    kind: str
    caption: str
    drilldown_metric: str | None = None
    interactive: bool = True


class AnalyticsChartPointRead(CrmSchema):
    period_key: str
    label: str
    turnover: Decimal = Decimal("0.00")
    gross_profit: Decimal = Decimal("0.00")
    net_result: Decimal = Decimal("0.00")
    finance_expenses: Decimal = Decimal("0.00")
    orders_count: int = 0
    new_clients: int = 0
    repeat_clients: int = 0


class AnalyticsChartGroupRead(CrmSchema):
    group: str
    points: list[AnalyticsChartPointRead]


class AnalyticsWaterfallStepRead(CrmSchema):
    key: str
    label: str
    value: Decimal


class AnalyticsTopCategoryRead(CrmSchema):
    category_id: int | None
    category_name: str
    orders_count: int
    turnover: Decimal
    gross_profit: Decimal


class AnalyticsTopServiceRead(CrmSchema):
    service_name: str
    category_name: str
    usage_count: int
    revenue: Decimal
    gross_profit: Decimal


class AnalyticsTopClientRead(CrmSchema):
    client_id: int
    client_name: str
    orders_count: int
    turnover: Decimal
    gross_profit: Decimal


class AnalyticsInsightRead(CrmSchema):
    key: str
    text: str
    tone: str


class AnalyticsLatestFinanceRead(CrmSchema):
    id: int
    expense_date: date
    category_id: int
    category_name: str
    comment: str
    amount: Decimal
    created_by_user_name: str | None = None


class AnalyticsFunnelStepRead(CrmSchema):
    key: str
    label: str
    value: int


class AnalyticsOrdersRowRead(CrmSchema):
    id: int
    date: datetime
    client_id: int
    client_name: str
    vehicle_id: int
    vehicle_label: str
    category_names: list[str]
    services_total: Decimal
    materials_total: Decimal
    discount_total: Decimal
    amount_to_pay: Decimal
    gross_profit: Decimal
    status: str
    employee_name: str | None = None
    completed_at: datetime | None = None
    completion_hours: Decimal | None = None


class AnalyticsServiceCategoryRowRead(CrmSchema):
    category_id: int | None
    category_name: str
    orders_count: int
    services_total: Decimal
    materials_total: Decimal
    discount_total: Decimal
    amount_to_pay: Decimal
    gross_profit: Decimal
    margin_percent: Decimal
    average_check: Decimal
    dynamics_delta_percent: Decimal = Decimal("0.00")
    top_services: list[AnalyticsTopServiceRead] = []
    top_clients: list[AnalyticsTopClientRead] = []


class AnalyticsServiceRowRead(CrmSchema):
    service_name: str
    category_id: int | None
    category_name: str
    usage_count: int
    revenue: Decimal
    average_price: Decimal
    min_price: Decimal
    max_price: Decimal
    gross_profit: Decimal
    recent_order_ids: list[int] = []


class AnalyticsSupplyRowRead(CrmSchema):
    id: int
    date: datetime
    order_id: int | None = None
    client_id: int | None = None
    client_name: str | None = None
    vehicle_id: int | None = None
    vehicle_label: str | None = None
    category_id: int | None
    category_name: str
    material_name: str
    quantity: int
    unit_price: Decimal
    amount: Decimal
    created_by_name: str | None = None


class AnalyticsTopNamedAmountRead(CrmSchema):
    name: str
    amount: Decimal
    related_id: int | None = None


class AnalyticsFinanceCategoryRowRead(CrmSchema):
    category_id: int
    category_name: str
    amount: Decimal
    share_percent: Decimal
    latest_expenses: list[AnalyticsLatestFinanceRead] = []


class AnalyticsClientRowRead(CrmSchema):
    client_id: int
    client_name: str
    phone: str
    orders_count: int
    amount_to_pay: Decimal
    gross_profit: Decimal
    average_check: Decimal
    last_visit: datetime | None
    favorite_services: list[str]
    activity_status: str
    ltv: Decimal
    segment: str


class AnalyticsSegmentRead(CrmSchema):
    key: str
    label: str
    value: int


class AnalyticsOverviewTabRead(CrmSchema):
    kpis_row_1: list[AnalyticsKpiRead]
    kpis_row_2: list[AnalyticsKpiRead]
    chart_groups: list[AnalyticsChartGroupRead]
    waterfall: list[AnalyticsWaterfallStepRead]
    top_categories: list[AnalyticsTopCategoryRead]
    top_services: list[AnalyticsTopServiceRead]
    top_clients: list[AnalyticsTopClientRead]
    latest_finances: list[AnalyticsLatestFinanceRead]
    insights: list[AnalyticsInsightRead]


class AnalyticsOrdersTabRead(CrmSchema):
    kpis: list[AnalyticsKpiRead]
    chart_groups: list[AnalyticsChartGroupRead]
    funnel: list[AnalyticsFunnelStepRead]
    rows: list[AnalyticsOrdersRowRead]


class AnalyticsServicesTabRead(CrmSchema):
    category_rows: list[AnalyticsServiceCategoryRowRead]
    service_rows: list[AnalyticsServiceRowRead]


class AnalyticsSuppliesTabRead(CrmSchema):
    kpis: list[AnalyticsKpiRead]
    rows: list[AnalyticsSupplyRowRead]
    top_materials: list[AnalyticsTopNamedAmountRead]
    top_orders: list[AnalyticsTopNamedAmountRead]
    top_categories: list[AnalyticsTopNamedAmountRead]


class AnalyticsFinancesTabRead(CrmSchema):
    kpis: list[AnalyticsKpiRead]
    chart_groups: list[AnalyticsChartGroupRead]
    category_rows: list[AnalyticsFinanceCategoryRowRead]
    rows: list[AnalyticsLatestFinanceRead]


class AnalyticsClientsTabRead(CrmSchema):
    kpis: list[AnalyticsKpiRead]
    chart_groups: list[AnalyticsChartGroupRead]
    rows: list[AnalyticsClientRowRead]
    segments: list[AnalyticsSegmentRead]


class AnalyticsDashboardRead(CrmSchema):
    filter: AnalyticsFilterEchoRead
    overview: AnalyticsOverviewTabRead
    orders: AnalyticsOrdersTabRead
    services: AnalyticsServicesTabRead
    supplies: AnalyticsSuppliesTabRead
    finances: AnalyticsFinancesTabRead
    clients: AnalyticsClientsTabRead
    generated_at: datetime


class AnalyticsDrilldownRowRead(CrmSchema):
    entity_type: str
    entity_id: int | None = None
    title: str
    subtitle: str | None = None
    date: datetime | None = None
    amount: Decimal | None = None
    gross_profit: Decimal | None = None
    status: str | None = None
    client_id: int | None = None
    vehicle_id: int | None = None
    order_id: int | None = None


class AnalyticsDrilldownRead(CrmSchema):
    metric: str
    title: str
    subtitle: str | None = None
    rows: list[AnalyticsDrilldownRowRead]
    generated_at: datetime
