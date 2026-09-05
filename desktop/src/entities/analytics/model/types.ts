export type AnalyticsFilterEcho = {
  category_ids: number[];
  date_from: string | null;
  date_to: string | null;
  finance_category_ids: number[];
  order_statuses: string[];
  period_preset: string;
};

export type AnalyticsKpi = {
  caption: string;
  drilldown_metric: string | null;
  interactive: boolean;
  key: string;
  kind: string;
  label: string;
  value: string;
};

export type AnalyticsChartPoint = {
  finance_expenses: string;
  gross_profit: string;
  label: string;
  net_result: string;
  new_clients: number;
  orders_count: number;
  period_key: string;
  repeat_clients: number;
  turnover: string;
};

export type AnalyticsChartGroup = {
  group: string;
  points: AnalyticsChartPoint[];
};

export type AnalyticsWaterfallStep = {
  key: string;
  label: string;
  value: string;
};

export type AnalyticsTopCategory = {
  category_id: number | null;
  category_name: string;
  gross_profit: string;
  orders_count: number;
  turnover: string;
};

export type AnalyticsTopService = {
  category_name: string;
  gross_profit: string;
  revenue: string;
  service_name: string;
  usage_count: number;
};

export type AnalyticsTopClient = {
  client_id: number;
  client_name: string;
  orders_count: number;
  gross_profit: string;
  turnover: string;
};

export type AnalyticsInsight = {
  key: string;
  text: string;
  tone: string;
};

export type AnalyticsLatestFinance = {
  amount: string;
  category_id: number;
  category_name: string;
  comment: string;
  created_by_user_name: string | null;
  expense_date: string;
  id: number;
};

export type AnalyticsFunnelStep = {
  key: string;
  label: string;
  value: number;
};

export type AnalyticsOrdersRow = {
  amount_to_pay: string;
  category_names: string[];
  client_id: number;
  client_name: string;
  completed_at: string | null;
  completion_hours: string | null;
  date: string;
  discount_total: string;
  employee_name: string | null;
  gross_profit: string;
  id: number;
  materials_total: string;
  services_total: string;
  status: string;
  vehicle_id: number;
  vehicle_label: string;
};

export type AnalyticsServiceCategoryRow = {
  amount_to_pay: string;
  average_check: string;
  category_id: number | null;
  category_name: string;
  discount_total: string;
  dynamics_delta_percent: string;
  gross_profit: string;
  margin_percent: string;
  materials_total: string;
  orders_count: number;
  services_total: string;
  top_clients: AnalyticsTopClient[];
  top_services: AnalyticsTopService[];
};

export type AnalyticsServiceRow = {
  average_price: string;
  category_id: number | null;
  category_name: string;
  max_price: string;
  min_price: string;
  gross_profit: string;
  recent_order_ids: number[];
  revenue: string;
  service_name: string;
  usage_count: number;
};

export type AnalyticsSupplyRow = {
  amount: string;
  category_id: number | null;
  category_name: string;
  client_id: number | null;
  client_name: string | null;
  created_by_name: string | null;
  date: string;
  id: number;
  material_name: string;
  order_id: number | null;
  quantity: number;
  unit_price: string;
  vehicle_id: number | null;
  vehicle_label: string | null;
};

export type AnalyticsTopNamedAmount = {
  amount: string;
  name: string;
  related_id: number | null;
};

export type AnalyticsFinanceCategoryRow = {
  amount: string;
  category_id: number;
  category_name: string;
  latest_expenses: AnalyticsLatestFinance[];
  share_percent: string;
};

export type AnalyticsClientRow = {
  activity_status: string;
  amount_to_pay: string;
  average_check: string;
  client_id: number;
  client_name: string;
  favorite_services: string[];
  gross_profit: string;
  last_visit: string | null;
  ltv: string;
  orders_count: number;
  phone: string;
  segment: string;
};

export type AnalyticsSegment = {
  key: string;
  label: string;
  value: number;
};

export type AnalyticsOverviewTab = {
  chart_groups: AnalyticsChartGroup[];
  insights: AnalyticsInsight[];
  kpis_row_1: AnalyticsKpi[];
  kpis_row_2: AnalyticsKpi[];
  latest_finances: AnalyticsLatestFinance[];
  top_categories: AnalyticsTopCategory[];
  top_clients: AnalyticsTopClient[];
  top_services: AnalyticsTopService[];
  waterfall: AnalyticsWaterfallStep[];
};

export type AnalyticsOrdersTab = {
  chart_groups: AnalyticsChartGroup[];
  funnel: AnalyticsFunnelStep[];
  kpis: AnalyticsKpi[];
  rows: AnalyticsOrdersRow[];
};

export type AnalyticsServicesTab = {
  category_rows: AnalyticsServiceCategoryRow[];
  service_rows: AnalyticsServiceRow[];
};

export type AnalyticsSuppliesTab = {
  kpis: AnalyticsKpi[];
  rows: AnalyticsSupplyRow[];
  top_categories: AnalyticsTopNamedAmount[];
  top_materials: AnalyticsTopNamedAmount[];
  top_orders: AnalyticsTopNamedAmount[];
};

export type AnalyticsFinancesTab = {
  category_rows: AnalyticsFinanceCategoryRow[];
  chart_groups: AnalyticsChartGroup[];
  kpis: AnalyticsKpi[];
  rows: AnalyticsLatestFinance[];
};

export type AnalyticsClientsTab = {
  chart_groups: AnalyticsChartGroup[];
  kpis: AnalyticsKpi[];
  rows: AnalyticsClientRow[];
  segments: AnalyticsSegment[];
};

export type AnalyticsDashboard = {
  clients: AnalyticsClientsTab;
  filter: AnalyticsFilterEcho;
  finances: AnalyticsFinancesTab;
  generated_at: string;
  orders: AnalyticsOrdersTab;
  overview: AnalyticsOverviewTab;
  services: AnalyticsServicesTab;
  supplies: AnalyticsSuppliesTab;
};

export type AnalyticsDrilldownRow = {
  amount: string | null;
  client_id: number | null;
  date: string | null;
  entity_id: number | null;
  entity_type: string;
  gross_profit: string | null;
  order_id: number | null;
  status: string | null;
  subtitle: string | null;
  title: string;
  vehicle_id: number | null;
};

export type AnalyticsDrilldown = {
  generated_at: string;
  metric: string;
  rows: AnalyticsDrilldownRow[];
  subtitle: string | null;
  title: string;
};
