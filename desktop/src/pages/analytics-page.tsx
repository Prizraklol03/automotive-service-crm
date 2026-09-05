import { type ReactNode, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { AnalyticsDrilldownParams } from "@/entities/analytics/api/analytics-api";
import type {
  AnalyticsChartPoint,
  AnalyticsClientRow,
  AnalyticsDashboard,
  AnalyticsLatestFinance,
  AnalyticsOrdersRow,
  AnalyticsServiceCategoryRow,
  AnalyticsServiceRow,
  AnalyticsSupplyRow,
  AnalyticsTopCategory,
  AnalyticsTopClient,
  AnalyticsTopService
} from "@/entities/analytics/model/types";
import type { ServiceCategory } from "@/entities/service/model/types";
import type { CrmOrderStatus } from "@/entities/settings/model/types";
import { useAnalyticsDashboardQuery, useAnalyticsDrilldownQuery } from "@/features/analytics/api/analytics-hooks";
import { AnalyticsChart } from "@/features/analytics/ui/analytics-chart";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { useServiceCategoriesQuery } from "@/features/services/api/services-hooks";
import { useOrderStatusesQuery, useVisualConfigQuery } from "@/features/settings/api/settings-hooks";
import { getAnalyticsWorkingMonthRange, resolveAnalyticsPeriodRange } from "@/shared/lib/analytics-period";
import { cn } from "@/shared/lib/cn";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/shared/lib/format";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelect } from "@/shared/ui/app-select";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { SectionCard } from "@/shared/ui/section-card";
import { PeriodRangePanel } from "@/shared/ui/period-range-panel";

const TAB_OPTIONS = [
  { key: "overview", label: "Обзор" },
  { key: "orders", label: "Заказы" },
  { key: "services", label: "Услуги" },
  { key: "supplies", label: "Расходники" },
  { key: "finances", label: "Финансы" },
  { key: "clients", label: "Клиенты" }
] as const;

const TAB_META = {
  clients: {
    description: "Повторные визиты, клиентские сегменты и сильнейшие клиенты по завершённым заказам.",
    subtitle: "Клиентская база и удержание"
  },
  finances: {
    description: "Сопоставление оборота, расходов и чистого результата на реальных финансовых записях.",
    subtitle: "Доходы, расходы и прибыльность"
  },
  orders: {
    description: "Анализ потока заказов, завершения работ и структуры по направлениям.",
    subtitle: "Анализ заказов и загрузки"
  },
  overview: {
    description: "Ключевые показатели бизнеса за выбранный период без демо-метрик и фейковых блоков.",
    subtitle: "Единая сводка по заказам, расходникам, финансам и клиентам."
  },
  services: {
    description: "Популярность и доходность услуг по реальным строкам заказов и актуальным категориям.",
    subtitle: "Популярность и доходность услуг"
  },
  supplies: {
    description: "Фактические расходники из журнала материалов за период без складских заглушек и псевдо-поставщиков.",
    subtitle: "Расходные материалы"
  }
} as const;

const PRESET_OPTIONS = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "7_days", label: "7 дней" },
  { value: "30_days", label: "30 дней" },
  { value: "working_month", label: "Рабочий месяц" },
  { value: "previous_working_month", label: "Прошлый рабочий месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "custom", label: "Свой период" }
] as const;

const CHART_COLORS = {
  blue: "#58A8F3",
  cyan: "#4DD6B0",
  green: "#42D392",
  grid: "rgba(255, 255, 255, 0.08)",
  muted: "#9B9A95",
  orange: "#F6B94D",
  pink: "#F17CB0",
  purple: "#9B7CF7",
  red: "#F17474",
  text: "#ECEBE7",
  tooltipBackground: "rgba(18, 18, 18, 0.96)"
} as const;

const CLIENT_SEGMENT_LABELS: Record<string, string> = {
  lost: "Уснувшие",
  new: "Новые",
  regular: "Постоянные",
  single: "Разовые",
  vip: "Ключевые"
};

type TabKey = (typeof TAB_OPTIONS)[number]["key"];
type PeriodPreset = (typeof PRESET_OPTIONS)[number]["value"];
type PeriodGroup = "day" | "month" | "week";

type DetailState =
  | {
      items: Array<{ label: string; value: string }>;
      mode: "summary";
      subtitle?: string;
      title: string;
    }
  | {
      mode: "drilldown";
      params: AnalyticsDrilldownParams;
      subtitle?: string;
      title: string;
    };

type PeriodBucket = {
  dateFrom: string;
  dateTo: string;
  key: string;
  label: string;
};

type KpiCardItem = {
  caption?: string;
  key: string;
  label: string;
  onClick?: () => void;
  tone?: "danger" | "muted" | "primary" | "success" | "warning";
  value: string;
  valueClassName?: string;
};

type StatusLookup = Map<string, CrmOrderStatus>;
type CategoryColorLookup = {
  byId: Map<number, string>;
  byName: Map<string, string>;
};

export function AnalyticsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(null);
  const visualQuery = useVisualConfigQuery();

  const activeTab = TAB_OPTIONS.some((item) => item.key === searchParams.get("tab"))
    ? (searchParams.get("tab") as TabKey)
    : "overview";
  const preset = (searchParams.get("preset") as PeriodPreset | null) ?? "working_month";
  const workingMonthStartDay = visualQuery.data?.working_month_start_day ?? 25;
  const rawDateFrom = searchParams.get("dateFrom");
  const rawDateTo = searchParams.get("dateTo");
  const resolvedRange = useMemo(
    () => resolveAppliedRange(preset, rawDateFrom, rawDateTo, workingMonthStartDay),
    [preset, rawDateFrom, rawDateTo, workingMonthStartDay]
  );
  const dashboardFilters = useMemo(
    () => ({
      dateFrom: resolvedRange.dateFrom,
      dateTo: resolvedRange.dateTo,
      periodPreset: preset
    }),
    [preset, resolvedRange.dateFrom, resolvedRange.dateTo]
  );

  const dashboardQuery = useAnalyticsDashboardQuery(dashboardFilters);
  const statusesQuery = useOrderStatusesQuery();
  const serviceCategoriesQuery = useServiceCategoriesQuery();
  const statusLookup = useMemo<StatusLookup>(() => buildStatusLookup(statusesQuery.data ?? []), [statusesQuery.data]);
  const serviceCategoryColors = useMemo<CategoryColorLookup>(
    () => buildCategoryColorLookup(serviceCategoriesQuery.data ?? []),
    [serviceCategoriesQuery.data]
  );

  const drilldownQuery = useAnalyticsDrilldownQuery(
    detailState?.mode === "drilldown"
      ? {
          ...dashboardFilters,
          ...detailState.params
        }
      : null
  );

  const activeMeta = TAB_META[activeTab];

  const updateParams = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    setSearchParams(next, { replace: true });
  };

  const handlePresetChange = (nextPreset: PeriodPreset) => {
    const range = resolveAppliedRange(nextPreset, null, null, workingMonthStartDay);
    updateParams({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      preset: nextPreset
    });
  };

  const resetFilters = () => {
    const range = resolveAppliedRange("working_month", null, null, workingMonthStartDay);
    updateParams({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      preset: "working_month"
    });
    setDetailState(null);
  };

  const openDrilldown = (title: string, params: AnalyticsDrilldownParams, subtitle?: string) => {
    setDetailState({
      mode: "drilldown",
      params,
      subtitle,
      title
    });
  };

  const openSummary = (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => {
    setDetailState({
      items,
      mode: "summary",
      subtitle,
      title
    });
  };

  const openOrder = (orderId: number) => {
    setDetailState(null);
    setSelectedOrderKey(String(orderId));
  };

  return (
    <PageContainer>
      <PageHeader
        title="Аналитика"
        description={activeTab === "overview" ? undefined : activeMeta.description}
        actions={
          <div className={cn("grid gap-2", isMobile ? "w-full grid-cols-1" : "max-w-[280px]")}>
            <AppSelect value={preset} onChange={(event) => handlePresetChange(event.target.value as PeriodPreset)}>
              {PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </AppSelect>
          </div>
        }
      />

      <PeriodRangePanel
        dateFrom={resolvedRange.dateFrom}
        dateTo={resolvedRange.dateTo}
        onDateFromChange={(event) =>
          updateParams({
            dateFrom: event.target.value || null,
            preset: "custom"
          })
        }
        onDateToChange={(event) =>
          updateParams({
            dateTo: event.target.value || null,
            preset: "custom"
          })
        }
        onReset={resetFilters}
      />

      <nav className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-1 border-b border-border/80">
          {TAB_OPTIONS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                className={cn(
                  "relative px-4 py-3 text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  updateParams({ tab: tab.key });
                  setDetailState(null);
                }}
              >
                {tab.label}
                <span
                  className={cn(
                    "absolute bottom-0 left-4 right-4 h-0.5 rounded-full transition-opacity",
                    isActive ? "bg-[#4FA8F2] opacity-100" : "bg-transparent opacity-0"
                  )}
                />
              </button>
            );
          })}
        </div>
      </nav>

      {dashboardQuery.isLoading ? (
        <LoadingState
          title="Загружаем аналитику"
          description="Собираем реальные показатели по заказам, услугам, расходникам, финансам и клиентам."
        />
      ) : null}

      {dashboardQuery.isError ? (
        <ErrorState
          title="Не удалось загрузить аналитику"
          description="Попробуйте обновить данные ещё раз."
          actionLabel="Повторить"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.isError && dashboardQuery.data ? (
        <AnalyticsTabContent
          activeTab={activeTab}
          dashboard={dashboardQuery.data}
          dateFrom={resolvedRange.dateFrom}
          dateTo={resolvedRange.dateTo}
          isMobile={isMobile}
          onOpenOrder={openOrder}
          serviceCategoryColors={serviceCategoryColors}
          statusLookup={statusLookup}
          subtitle={activeMeta.subtitle}
          onOpenDrilldown={openDrilldown}
          onOpenSummary={openSummary}
        />
      ) : null}

      <AnalyticsDetailPanel
        detailState={detailState}
        drilldownRows={drilldownQuery.data?.rows ?? []}
        isLoading={drilldownQuery.isLoading}
        isMobile={isMobile}
        onClose={() => setDetailState(null)}
      />

      {selectedOrderKey ? (
        <OrderDetailPanel
          desktopMode={isMobile || orderDetailVersion === "legacy" ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={() => setSelectedOrderKey(null)}
          orderKey={selectedOrderKey}
          variant={orderDetailVersion}
        />
      ) : null}
    </PageContainer>
  );
}

function AnalyticsTabContent({
  activeTab,
  dashboard,
  dateFrom,
  dateTo,
  isMobile,
  onOpenOrder,
  onOpenDrilldown,
  onOpenSummary,
  serviceCategoryColors,
  statusLookup,
  subtitle
}: {
  activeTab: TabKey;
  dashboard: AnalyticsDashboard;
  dateFrom: string;
  dateTo: string;
  isMobile: boolean;
  onOpenOrder: (orderId: number) => void;
  onOpenDrilldown: (title: string, params: AnalyticsDrilldownParams, subtitle?: string) => void;
  onOpenSummary: (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => void;
  serviceCategoryColors: CategoryColorLookup;
  statusLookup: StatusLookup;
  subtitle: string;
}) {
  if (activeTab === "overview") {
    return (
      <OverviewTab
        dashboard={dashboard}
        dateFrom={dateFrom}
        dateTo={dateTo}
        isMobile={isMobile}
        subtitle={subtitle}
        onOpenDrilldown={onOpenDrilldown}
      />
    );
  }

  if (activeTab === "orders") {
    return (
      <OrdersTab
        dashboard={dashboard}
        dateFrom={dateFrom}
        dateTo={dateTo}
        isMobile={isMobile}
        onOpenOrder={onOpenOrder}
        statusLookup={statusLookup}
        serviceCategoryColors={serviceCategoryColors}
        subtitle={subtitle}
        onOpenDrilldown={onOpenDrilldown}
        onOpenSummary={onOpenSummary}
      />
    );
  }

  if (activeTab === "services") {
    return (
      <ServicesTab
        dashboard={dashboard}
        isMobile={isMobile}
        serviceCategoryColors={serviceCategoryColors}
        subtitle={subtitle}
        onOpenSummary={onOpenSummary}
      />
    );
  }

  if (activeTab === "supplies") {
    return (
      <SuppliesTab
        dashboard={dashboard}
        dateFrom={dateFrom}
        dateTo={dateTo}
        isMobile={isMobile}
        serviceCategoryColors={serviceCategoryColors}
        subtitle={subtitle}
        onOpenSummary={onOpenSummary}
      />
    );
  }

  if (activeTab === "finances") {
    return (
      <FinancesTab
        dashboard={dashboard}
        dateFrom={dateFrom}
        dateTo={dateTo}
        isMobile={isMobile}
        subtitle={subtitle}
        onOpenDrilldown={onOpenDrilldown}
        onOpenSummary={onOpenSummary}
      />
    );
  }

  return (
    <ClientsTab
      dashboard={dashboard}
      dateFrom={dateFrom}
      dateTo={dateTo}
      isMobile={isMobile}
      serviceCategoryColors={serviceCategoryColors}
      subtitle={subtitle}
      onOpenDrilldown={onOpenDrilldown}
      onOpenSummary={onOpenSummary}
    />
  );
}

function OverviewTab({
  dashboard,
  dateFrom,
  dateTo,
  isMobile,
  onOpenDrilldown,
  subtitle
}: {
  dashboard: AnalyticsDashboard;
  dateFrom: string;
  dateTo: string;
  isMobile: boolean;
  onOpenDrilldown: (title: string, params: AnalyticsDrilldownParams, subtitle?: string) => void;
  subtitle: string;
}) {
  const group = inferLongRangeGroup(dateFrom, dateTo);
  const buckets = useMemo(() => buildPeriodBuckets(dateFrom, dateTo, group), [dateFrom, dateTo, group]);
  const points = useMemo(
    () => fillChartPoints(selectChartGroup(dashboard.overview.chart_groups, group).points, buckets),
    [buckets, dashboard.overview.chart_groups, group]
  );

  const chartOption = useMemo(
    () =>
      buildOverviewOption({
        buckets,
        grossProfit: points.map((point) => point.gross_profit),
        isMobile,
        netResult: points.map((point) => point.net_result),
        turnover: points.map((point) => point.turnover)
      }),
    [buckets, isMobile, points]
  );

  const kpisRow1 = dashboard.overview.kpis_row_1.map((item) =>
    mapKpiToCard(item, () => {
      if (!item.drilldown_metric || !item.interactive) {
        return;
      }
      onOpenDrilldown(item.label, { metric: item.drilldown_metric }, item.caption);
    })
  );
  const kpisRow2 = dashboard.overview.kpis_row_2.map((item) =>
    mapKpiToCard(item, () => {
      if (!item.drilldown_metric || !item.interactive) {
        return;
      }
      onOpenDrilldown(item.label, { metric: item.drilldown_metric }, item.caption);
    })
  );

  return (
    <div className="space-y-[var(--section-gap)]">
      <AnalyticsKpiRow items={kpisRow1} />
      <AnalyticsKpiRow items={kpisRow2} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
        <div className="space-y-4">
          <SectionCard title="Финансовая динамика" description="Оборот, валовая прибыль и чистый результат по выбранному периоду.">
            <AnalyticsChart
              height={isMobile ? 260 : 320}
              option={chartOption}
              onClick={(params) => {
                const bucket = readBucketFromChartClick(params, buckets);
                if (!bucket) {
                  return;
                }
                const metric = resolveOverviewDrilldownMetric(params.seriesName);
                if (!metric) {
                  return;
                }
                onOpenDrilldown(
                  metric === "net_result" ? "Чистый результат" : params.seriesName ?? "Динамика",
                  {
                    metric,
                    pointFrom: bucket.dateFrom,
                    pointTo: bucket.dateTo
                  },
                  `${formatDate(bucket.dateFrom)} - ${formatDate(bucket.dateTo)}`
                );
              }}
            />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <SimpleRankingCard title="Топ категорий по валовой прибыли" items={dashboard.overview.top_categories} />
            <SimpleRankingCard title="Топ услуг по обороту" items={dashboard.overview.top_services} />
            <SimpleRankingCard title="Топ клиентов" items={dashboard.overview.top_clients} />
          </div>
        </div>

        <div className="space-y-4">
          <SectionCard title="Структура результата" description="Как складывается чистый результат без старых полей и дублей.">
            <div className="space-y-3">
              {dashboard.overview.waterfall.map((step) => (
                <MetricRow key={step.key} label={step.label} value={formatSignedCurrency(step.value)} />
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Короткие выводы" description="Тезисы по текущему периоду без декоративного шума.">
            <div className="space-y-3">
              {dashboard.overview.insights.length ? (
                dashboard.overview.insights.map((insight) => (
                  <div key={insight.key} className="rounded-2xl border border-border/80 bg-surface/65 px-4 py-3 text-sm text-foreground">
                    {insight.text}
                  </div>
                ))
              ) : (
                <EmptyState title="Нет инсайтов" description="Для выбранного периода пока недостаточно данных." />
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({
  dashboard,
  dateFrom,
  dateTo,
  isMobile,
  onOpenOrder,
  onOpenDrilldown,
  onOpenSummary,
  serviceCategoryColors,
  statusLookup,
  subtitle
}: {
  dashboard: AnalyticsDashboard;
  dateFrom: string;
  dateTo: string;
  isMobile: boolean;
  onOpenOrder: (orderId: number) => void;
  onOpenDrilldown: (title: string, params: AnalyticsDrilldownParams, subtitle?: string) => void;
  onOpenSummary: (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => void;
  serviceCategoryColors: CategoryColorLookup;
  statusLookup: StatusLookup;
  subtitle: string;
}) {
  const rows = dashboard.orders.rows;
  const group = inferOrdersGroup(dateFrom, dateTo);
  const buckets = useMemo(() => buildPeriodBuckets(dateFrom, dateTo, group), [dateFrom, dateTo, group]);
  const createdSeries = useMemo(
    () => mapBucketsToValues(selectChartGroup(dashboard.orders.chart_groups, group).points, buckets, (point) => point.orders_count),
    [buckets, dashboard.orders.chart_groups, group]
  );
  const completedSeries = useMemo(
    () => aggregateRowsIntoBuckets(rows, buckets, (row) => row.completed_at ?? row.date, () => 1),
    [buckets, rows]
  );
  const completionByCategory = useMemo(() => buildCompletionCategoryStats(rows), [rows]);
  const topCategories = useMemo(() => buildOrderCategoryStats(rows), [rows]);
  const ordersKpis = buildOrdersKpis(rows, dashboard);

  const chartOption = useMemo(
    () =>
      buildOrdersDynamicsOption({
        buckets,
        completed: completedSeries,
        created: createdSeries,
        isMobile
      }),
    [buckets, completedSeries, createdSeries, isMobile]
  );

  return (
    <div className="space-y-[var(--section-gap)]">
      <AnalyticsKpiRow items={ordersKpis} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
        <div className="space-y-4">
          <SectionCard title="Динамика заказов" description="Созданные и завершённые заказы по выбранному периоду.">
            <AnalyticsChart
              height={isMobile ? 260 : 320}
              option={chartOption}
              onClick={(params) => {
                const bucket = readBucketFromChartClick(params, buckets);
                if (!bucket) {
                  return;
                }
                onOpenDrilldown(
                  params.seriesName ?? "Заказы",
                  {
                    metric: "completed_orders",
                    pointFrom: bucket.dateFrom,
                    pointTo: bucket.dateTo
                  },
                  `${formatDate(bucket.dateFrom)} - ${formatDate(bucket.dateTo)}`
                );
              }}
            />
          </SectionCard>

          <SectionCard title="Завершённые заказы" description="Только реальные строки завершённых заказов за выбранный период.">
            {rows.length ? (
              <ExpandableStack
                items={rows}
                itemKey={(row) => row.id}
                renderItem={(row) => (
                  <button
                    type="button"
                    className="grid w-full gap-4 rounded-2xl border border-border/80 bg-surface/65 p-4 text-left transition-colors hover:bg-surface-2/60 lg:grid-cols-[minmax(0,1.4fr)_140px_140px_160px]"
                    onClick={() => onOpenOrder(row.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">Заказ #{row.id}</span>
                        <StatusChip status={statusLookup.get(row.status)} fallbackLabel={row.status} />
                      </div>
                      <div className="mt-1 truncate text-sm text-foreground">{row.client_name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {row.vehicle_label} • {row.category_names.join(", ") || "Без категории"}
                      </div>
                    </div>
                    <MetricCell label="К оплате" value={formatCurrency(row.amount_to_pay)} />
                    <MetricCell label="Валовая прибыль" value={formatCurrency(row.gross_profit)} />
                    <MetricCell label="Срок" value={row.completion_hours ? formatHoursCompact(parseNumber(row.completion_hours)) : "Нет данных"} />
                  </button>
                )}
              />
            ) : (
              <EmptyState title="Нет заказов" description="За выбранный период завершённых заказов не найдено." />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="По категориям" description="Какие направления чаще попадают в завершённые заказы.">
            <ProgressList
              items={topCategories.map((item) => ({
                color: resolveCategoryColor(serviceCategoryColors, { name: item.label }),
                label: item.label,
                value: item.count,
                valueLabel: formatNumber(item.count)
              }))}
            />
          </SectionCard>
          <SectionCard title="Скорость выполнения" description="Среднее время закрытия по категориям завершённых заказов.">
            <ProgressList
              items={completionByCategory.map((item) => ({
                color: resolveCategoryColor(serviceCategoryColors, { name: item.label }),
                label: item.label,
                value: item.hours,
                valueLabel: formatHoursCompact(item.hours)
              }))}
              maxValue={Math.max(...completionByCategory.map((item) => item.hours), 0)}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ServicesTab({
  dashboard,
  isMobile,
  onOpenSummary,
  serviceCategoryColors,
  subtitle
}: {
  dashboard: AnalyticsDashboard;
  isMobile: boolean;
  onOpenSummary: (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => void;
  serviceCategoryColors: CategoryColorLookup;
  subtitle: string;
}) {
  const categoryRows = dashboard.services.category_rows;
  const serviceRows = dashboard.services.service_rows;
  const totalUsage = serviceRows.reduce((sum, row) => sum + row.usage_count, 0);
  const totalRevenue = serviceRows.reduce((sum, row) => sum + parseMoney(row.revenue), 0);
  const averagePrice = totalUsage ? totalRevenue / totalUsage : 0;
  const averageMargin = categoryRows.length
    ? categoryRows.reduce((sum, row) => sum + parseNumber(row.margin_percent), 0) / categoryRows.length
    : 0;

  const categoryChartOption = useMemo(
    () =>
      buildHorizontalBarOption({
        categories: categoryRows.map((row) => row.category_name),
        colorBuilder: (index) =>
          resolveCategoryColor(serviceCategoryColors, {
            id: categoryRows[index]?.category_id ?? null,
            name: categoryRows[index]?.category_name
          }),
        isMobile,
        seriesName: "Оборот",
        valueFormatter: (value) => formatCurrency(value),
        values: categoryRows.map((row) => parseMoney(row.amount_to_pay))
      }),
    [categoryRows, isMobile, serviceCategoryColors]
  );

  const popularityItems = serviceRows.map((row) => ({
    color: resolveCategoryColor(serviceCategoryColors, { id: row.category_id, name: row.category_name }, row.service_name),
    label: row.service_name,
    value: row.usage_count,
    valueLabel: `${formatNumber(row.usage_count)} раз`
  }));

  const marginItems = categoryRows.map((row) => ({
    color: resolveCategoryColor(serviceCategoryColors, { id: row.category_id, name: row.category_name }),
    label: row.category_name,
    value: parseNumber(row.margin_percent),
    valueLabel: formatPercentValue(parseNumber(row.margin_percent), 0)
  }));

  const kpis: KpiCardItem[] = [
    { key: "service-count", label: "Всего услуг", value: formatNumber(serviceRows.length) },
    { key: "service-usage", label: "Выполнено", value: formatNumber(totalUsage), tone: "primary" },
    { key: "service-average", label: "Средняя стоимость", value: formatCurrency(averagePrice) },
    { key: "service-revenue", label: "Оборот услуг", value: formatCurrency(totalRevenue), tone: "success" },
    { key: "service-margin", label: "Средняя маржинальность", value: formatPercentValue(averageMargin, 0), tone: "warning" }
  ];

  return (
    <div className="space-y-[var(--section-gap)]">
      <AnalyticsKpiRow items={kpis} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <div className="space-y-4">
          <SectionCard title="Топ услуг по обороту" description="Реальная популярность и оборот по строкам услуг в заказах.">
            {serviceRows.length ? (
              <ExpandableStack
                items={serviceRows}
                itemKey={(row) => `${row.service_name}:${row.category_id ?? "na"}`}
                renderItem={(row) => (
                  <button
                    type="button"
                    className="grid w-full gap-4 rounded-2xl border border-border/80 bg-surface/65 p-4 text-left transition-colors hover:bg-surface-2/60 lg:grid-cols-[minmax(0,1.4fr)_120px_150px_140px]"
                    onClick={() => onOpenSummary(row.service_name, buildServiceSummary(row), row.category_name)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{row.service_name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{row.category_name}</div>
                    </div>
                    <MetricCell label="Кол-во" value={formatNumber(row.usage_count)} />
                    <MetricCell label="Оборот" value={formatCurrency(row.revenue)} />
                    <MetricCell label="Ср. цена" value={formatCurrency(row.average_price)} />
                  </button>
                )}
              />
            ) : (
              <EmptyState title="Нет услуг" description="За выбранный период услуги не использовались." />
            )}
          </SectionCard>

          <SectionCard title="Оборот по категориям" description="Сравнение категорий услуг без декоративной псевдо-аналитики.">
            {categoryRows.length ? (
              <AnalyticsChart
                height={isMobile ? 260 : 320}
                option={categoryChartOption}
                onClick={(params) => {
                  const index = typeof params.dataIndex === "number" ? params.dataIndex : -1;
                  const row = index >= 0 ? categoryRows[index] : null;
                  if (!row) {
                    return;
                  }
                  onOpenSummary(row.category_name, buildServiceCategorySummary(row));
                }}
              />
            ) : (
              <EmptyState title="Нет категорий" description="Для выбранного периода пока нет категорий услуг." />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Маржинальность категорий" description="Маржа по категориям услуг с учётом расходников.">
            <ProgressList items={marginItems} maxValue={100} />
          </SectionCard>
          <SectionCard title="Популярность услуг" description="Какие работы встречаются чаще всего.">
            <ProgressList items={popularityItems} maxValue={Math.max(...popularityItems.map((item) => item.value), 0)} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SuppliesTab({
  dashboard,
  dateFrom,
  dateTo,
  isMobile,
  onOpenSummary,
  serviceCategoryColors,
  subtitle
}: {
  dashboard: AnalyticsDashboard;
  dateFrom: string;
  dateTo: string;
  isMobile: boolean;
  onOpenSummary: (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => void;
  serviceCategoryColors: CategoryColorLookup;
  subtitle: string;
}) {
  const rows = dashboard.supplies.rows;
  const group = inferLongRangeGroup(dateFrom, dateTo);
  const buckets = useMemo(() => buildPeriodBuckets(dateFrom, dateTo, group), [dateFrom, dateTo, group]);
  const amountSeries = useMemo(
    () => aggregateRowsIntoBuckets(rows, buckets, (row) => row.date, (row) => parseMoney(row.amount)),
    [buckets, rows]
  );

  const categoryStats = useMemo(() => buildSupplyCategoryStats(rows), [rows]);
  const totalAmount = rows.reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const averageItemCost = totalQuantity ? totalAmount / totalQuantity : 0;
  const completedOrders = parseKpiValue(dashboard.overview.kpis_row_1, "completed_orders");
  const turnover = parseKpiMoney(dashboard.overview.kpis_row_1, "turnover");

  const kpis: KpiCardItem[] = [
    { key: "supplies-total", label: "Расход на расходники", value: formatCurrency(totalAmount), tone: "primary" },
    { key: "supplies-share", label: "Доля в обороте", value: formatPercentValue(turnover ? (totalAmount / turnover) * 100 : 0, 0), tone: "warning" },
    { key: "supplies-positions", label: "Позиции", value: formatNumber(rows.length) },
    { key: "supplies-average", label: "Ср. стоимость", value: formatCurrency(averageItemCost) },
    { key: "supplies-order-average", label: "На заказ", value: formatCurrency(completedOrders ? totalAmount / completedOrders : 0), tone: "success" }
  ];

  const monthlyOption = useMemo(
    () =>
      buildSingleSeriesBarOption({
        buckets,
        color: CHART_COLORS.blue,
        isMobile,
        seriesName: "Расходники",
        valueFormatter: (value) => formatCurrency(value),
        values: amountSeries
      }),
    [amountSeries, buckets, isMobile]
  );

  return (
    <div className="space-y-[var(--section-gap)]">
      <AnalyticsKpiRow items={kpis} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <div className="space-y-4">
          <SectionCard title="Расход по категориям" description="Реальные строки расходников без складских заглушек и пустых полей.">
            {categoryStats.length ? (
              <ExpandableStack
                items={categoryStats}
                itemKey={(item) => item.label}
                renderItem={(item) => (
                  <button
                    type="button"
                    className="grid w-full gap-4 rounded-2xl border border-border/80 bg-surface/65 p-4 text-left transition-colors hover:bg-surface-2/60 lg:grid-cols-[minmax(0,1fr)_100px_140px_90px]"
                    onClick={() =>
                      onOpenSummary(item.label, [
                        { label: "Количество", value: formatNumber(item.quantity) },
                        { label: "Сумма", value: formatCurrency(item.amount) },
                        { label: "Доля", value: formatPercentValue(item.share, 0) }
                      ])
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-10 w-1 rounded-full"
                        style={{ backgroundColor: resolveCategoryColor(serviceCategoryColors, { id: item.categoryId, name: item.label }) }}
                      />
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{item.label}</span>
                    </div>
                    <MetricCell label="Кол-во" value={formatNumber(item.quantity)} />
                    <MetricCell label="Сумма" value={formatCurrency(item.amount)} />
                    <MetricCell label="Доля" value={formatPercentValue(item.share, 0)} />
                  </button>
                )}
              />
            ) : (
              <EmptyState title="Нет расходников" description="За выбранный период журнал расходников пуст." />
            )}
          </SectionCard>

          <SectionCard title="Динамика расходников" description="Сумма расходников по выбранному периоду.">
            {rows.length ? <AnalyticsChart height={isMobile ? 260 : 300} option={monthlyOption} /> : <EmptyState title="Нет графика" description="Нечего строить без записей по расходникам." />}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Топ материалов" description="Материалы с максимальной суммой затрат.">
            <ProgressList
              items={dashboard.supplies.top_materials.map((item) => ({
                color: CHART_COLORS.blue,
                label: item.name,
                value: parseMoney(item.amount),
                valueLabel: formatCurrency(item.amount)
              }))}
            />
          </SectionCard>
          <SectionCard title="Последние операции" description="Свежие движения из журнала расходников.">
            <ExpandableStack
              items={rows}
              itemKey={(row) => row.id}
              renderItem={(row) => (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/65 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
                  onClick={() => onOpenSummary(row.material_name, buildSupplySummary(row), row.category_name)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{row.material_name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{formatDateTime(row.date)}</div>
                  </div>
                  <div className="text-sm font-semibold text-foreground">{formatCurrency(row.amount)}</div>
                </button>
              )}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function FinancesTab({
  dashboard,
  dateFrom,
  dateTo,
  isMobile,
  onOpenDrilldown,
  onOpenSummary,
  subtitle
}: {
  dashboard: AnalyticsDashboard;
  dateFrom: string;
  dateTo: string;
  isMobile: boolean;
  onOpenDrilldown: (title: string, params: AnalyticsDrilldownParams, subtitle?: string) => void;
  onOpenSummary: (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => void;
  subtitle: string;
}) {
  const group = inferLongRangeGroup(dateFrom, dateTo);
  const buckets = useMemo(() => buildPeriodBuckets(dateFrom, dateTo, group), [dateFrom, dateTo, group]);
  const overviewPoints = useMemo(
    () => fillChartPoints(selectChartGroup(dashboard.overview.chart_groups, group).points, buckets),
    [buckets, dashboard.overview.chart_groups, group]
  );
  const financeSeries = useMemo(
    () => mapBucketsToValues(selectChartGroup(dashboard.finances.chart_groups, group).points, buckets, (point) => parseMoney(point.finance_expenses)),
    [buckets, dashboard.finances.chart_groups, group]
  );

  const turnoverSeries = overviewPoints.map((point) => point.turnover);
  const grossProfitSeries = overviewPoints.map((point) => point.gross_profit);
  const netSeries = overviewPoints.map((point) => point.net_result);

  const totalTurnover = turnoverSeries.reduce((sum, value) => sum + value, 0);
  const totalGrossProfit = grossProfitSeries.reduce((sum, value) => sum + value, 0);
  const totalFinance = financeSeries.reduce((sum, value) => sum + value, 0);
  const totalNet = netSeries.reduce((sum, value) => sum + value, 0);

  const kpis: KpiCardItem[] = [
    { key: "finance-turnover", label: "Оборот", value: formatCurrency(totalTurnover), tone: "primary" },
    { key: "finance-gross", label: "Валовая прибыль", value: formatCurrency(totalGrossProfit), tone: "success" },
    { key: "finance-expenses", label: "Финансовые расходы", value: formatCurrency(totalFinance), tone: "warning" },
    { key: "finance-net", label: "Чистый результат", value: formatCurrency(totalNet), tone: totalNet >= 0 ? "success" : "danger" },
    { key: "finance-margin", label: "Рентабельность", value: formatPercentValue(totalTurnover ? (totalNet / totalTurnover) * 100 : 0, 1) }
  ];

  const financeChartOption = useMemo(
    () =>
      buildFinancesOption({
        buckets,
        expenses: financeSeries,
        grossProfit: grossProfitSeries,
        isMobile,
        turnover: turnoverSeries
      }),
    [buckets, financeSeries, grossProfitSeries, isMobile, turnoverSeries]
  );

  const profitabilityItems = buckets.map((bucket, index) => {
    const turnover = turnoverSeries[index] ?? 0;
    const net = netSeries[index] ?? 0;
    const ratio = turnover ? (net / turnover) * 100 : 0;
    return {
      color: index === buckets.length - 1 ? CHART_COLORS.cyan : "rgba(255, 255, 255, 0.16)",
      label: bucket.label,
      value: ratio,
      valueLabel: formatPercentValue(ratio, 1)
    };
  });

  return (
    <div className="space-y-[var(--section-gap)]">
      <AnalyticsKpiRow items={kpis} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <div className="space-y-4">
          <SectionCard title="Оборот vs расходы" description="Сопоставление оборота, валовой прибыли и финансовых расходов по периодам.">
            <AnalyticsChart
              height={isMobile ? 260 : 320}
              option={financeChartOption}
              onClick={(params) => {
                const bucket = readBucketFromChartClick(params, buckets);
                if (!bucket) {
                  return;
                }
                const metric = params.seriesName === "Финансовые расходы" ? "finance_expenses" : "turnover";
                onOpenDrilldown(
                  params.seriesName ?? "Финансы",
                  {
                    metric,
                    pointFrom: bucket.dateFrom,
                    pointTo: bucket.dateTo
                  },
                  `${formatDate(bucket.dateFrom)} - ${formatDate(bucket.dateTo)}`
                );
              }}
            />
          </SectionCard>

          <SectionCard title="Последние финансовые записи" description="Свежие расходы по категориям и комментариям.">
            {dashboard.finances.rows.length ? (
              <ExpandableStack
                items={dashboard.finances.rows}
                itemKey={(row) => row.id}
                renderItem={(row) => (
                  <button
                    type="button"
                    className="grid w-full gap-4 rounded-2xl border border-border/80 bg-surface/65 p-4 text-left transition-colors hover:bg-surface-2/60 lg:grid-cols-[140px_180px_minmax(0,1fr)_120px]"
                    onClick={() => onOpenSummary(row.category_name, buildFinanceSummary(row), row.comment || "Без комментария")}
                  >
                    <MetricCell label="Дата" value={formatDate(row.expense_date)} />
                    <MetricCell label="Категория" value={row.category_name} />
                    <MetricCell label="Комментарий" value={row.comment || "Без комментария"} />
                    <MetricCell label="Сумма" value={formatCurrency(row.amount)} />
                  </button>
                )}
              />
            ) : (
              <EmptyState title="Нет расходов" description="За выбранный период финансовых записей не найдено." />
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Структура расходов" description="Категории финансовых расходов за текущий период.">
            <ProgressList
              items={dashboard.finances.category_rows.map((row) => ({
                color: pickStableSeriesColor(row.category_name),
                label: row.category_name,
                value: parseMoney(row.amount),
                valueLabel: formatCurrency(row.amount)
              }))}
            />
          </SectionCard>
          <SectionCard title="Рентабельность по периодам" description="Чистый результат относительно оборота по каждому периоду.">
            <ProgressList items={profitabilityItems} maxValue={Math.max(...profitabilityItems.map((item) => item.value), 0)} />
          </SectionCard>
          <SectionCard title="Крупнейшие расходы" description="Самые затратные финансовые записи периода.">
            <ProgressList
              items={dashboard.finances.rows.map((row) => ({
                color: pickStableSeriesColor(row.category_name),
                label: row.comment || row.category_name,
                value: parseMoney(row.amount),
                valueLabel: formatCurrency(row.amount)
              }))}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ClientsTab({
  dashboard,
  dateFrom,
  dateTo,
  isMobile,
  onOpenDrilldown,
  onOpenSummary,
  serviceCategoryColors,
  subtitle
}: {
  dashboard: AnalyticsDashboard;
  dateFrom: string;
  dateTo: string;
  isMobile: boolean;
  onOpenDrilldown: (title: string, params: AnalyticsDrilldownParams, subtitle?: string) => void;
  onOpenSummary: (title: string, items: Array<{ label: string; value: string }>, subtitle?: string) => void;
  serviceCategoryColors: CategoryColorLookup;
  subtitle: string;
}) {
  const rows = dashboard.clients.rows;
  const group = inferLongRangeGroup(dateFrom, dateTo);
  const buckets = useMemo(() => buildPeriodBuckets(dateFrom, dateTo, group), [dateFrom, dateTo, group]);
  const points = useMemo(
    () => fillChartPoints(selectChartGroup(dashboard.clients.chart_groups, group).points, buckets),
    [buckets, dashboard.clients.chart_groups, group]
  );

  const clientsCount = rows.length;
  const newClients = rows.filter((row) => row.segment === "new").length;
  const repeatClients = rows.filter((row) => row.orders_count > 1).length;
  const returnRate = clientsCount ? (repeatClients / clientsCount) * 100 : 0;
  const averageCheck = rows.reduce((sum, row) => sum + parseMoney(row.amount_to_pay), 0) / Math.max(rows.reduce((sum, row) => sum + row.orders_count, 0), 1);
  const averageLtv = rows.reduce((sum, row) => sum + parseMoney(row.ltv), 0) / Math.max(rows.length, 1);
  const inactivity = {
    d30: rows.filter((row) => row.activity_status.includes("30+")).length,
    d60: rows.filter((row) => row.activity_status.includes("60+")).length,
    d90: rows.filter((row) => row.activity_status.includes("90+")).length
  };

  const kpis: KpiCardItem[] = [
    { key: "clients-total", label: "Всего клиентов", value: formatNumber(clientsCount) },
    { key: "clients-new", label: "Новые за период", onClick: () => onOpenDrilldown("Новые клиенты", { metric: "new_clients" }, "Клиенты без завершённых заказов до текущего визита"), tone: "primary", value: formatNumber(newClients) },
    { key: "clients-repeat", label: "Повторные", onClick: () => onOpenDrilldown("Повторные клиенты", { metric: "repeat_clients" }, "Клиенты с повторными завершёнными заказами"), tone: "success", value: formatNumber(repeatClients) },
    { key: "clients-return", label: "Возврат", value: formatPercentValue(returnRate, 0) },
    { key: "clients-average-check", label: "Средний чек", value: formatCurrency(averageCheck) },
    { key: "clients-average-ltv", label: "Средний LTV", value: formatCurrency(averageLtv), tone: "warning" }
  ];

  const growthOption = useMemo(
    () =>
      buildClientsGrowthOption({
        buckets,
        isMobile,
        newClients: points.map((point) => point.new_clients),
        repeatClients: points.map((point) => point.repeat_clients)
      }),
    [buckets, isMobile, points]
  );

  const favoriteServices = buildFavoriteServiceStats(rows);
  const serviceColorsByName = useMemo(
    () => buildServiceColorLookup(dashboard.services.service_rows, serviceCategoryColors),
    [dashboard.services.service_rows, serviceCategoryColors]
  );

  return (
    <div className="space-y-[var(--section-gap)]">
      <AnalyticsKpiRow items={kpis} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <SectionCard title="Топ клиентов по обороту" description="Клиенты с лучшим результатом за выбранный период.">
          {rows.length ? (
            <ExpandableStack
              items={rows}
              itemKey={(row) => row.client_id}
              renderItem={(row) => (
                <button
                  type="button"
                  className="grid w-full gap-4 rounded-2xl border border-border/80 bg-surface/65 p-4 text-left transition-colors hover:bg-surface-2/60 lg:grid-cols-[minmax(0,1.3fr)_100px_140px_100px]"
                  onClick={() => onOpenSummary(row.client_name, buildClientSummary(row), row.phone)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{row.client_name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{row.phone} • {CLIENT_SEGMENT_LABELS[row.segment] ?? row.segment}</div>
                  </div>
                  <MetricCell label="Заказов" value={formatNumber(row.orders_count)} />
                  <MetricCell label="Оборот" value={formatCurrency(row.amount_to_pay)} />
                  <MetricCell label="Визит" value={row.last_visit ? formatDateTime(row.last_visit) : "Нет данных"} />
                </button>
              )}
            />
          ) : (
            <EmptyState title="Нет клиентов" description="За выбранный период завершённых клиентов не найдено." />
          )}
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Сегменты клиентов" description="Текущая структура клиентской базы за период.">
            <ProgressList
              items={dashboard.clients.segments.map((segment) => ({
                color: resolveClientSegmentColor(segment.key),
                label: segment.label,
                value: segment.value,
                valueLabel: formatNumber(segment.value)
              }))}
            />
          </SectionCard>
          <SectionCard title="Без визитов" description="Клиенты, которые давно не возвращались.">
            <ProgressList
              items={[
                { color: CHART_COLORS.orange, label: "30+ дней", value: inactivity.d30, valueLabel: formatNumber(inactivity.d30) },
                { color: CHART_COLORS.pink, label: "60+ дней", value: inactivity.d60, valueLabel: formatNumber(inactivity.d60) },
                { color: CHART_COLORS.red, label: "90+ дней", value: inactivity.d90, valueLabel: formatNumber(inactivity.d90) }
              ]}
            />
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <SectionCard title="Рост клиентской базы" description="Новые и повторные клиенты по периодам.">
          <AnalyticsChart
            height={isMobile ? 260 : 300}
            option={growthOption}
            onClick={(params) => {
              const bucket = readBucketFromChartClick(params, buckets);
              if (!bucket) {
                return;
              }
              const metric = params.seriesName === "Новые" ? "new_clients" : "repeat_clients";
              onOpenDrilldown(
                params.seriesName ?? "Клиенты",
                {
                  metric,
                  pointFrom: bucket.dateFrom,
                  pointTo: bucket.dateTo
                },
                `${formatDate(bucket.dateFrom)} - ${formatDate(bucket.dateTo)}`
              );
            }}
          />
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Любимые услуги" description="Услуги, которые чаще всего встречаются у сильных клиентов.">
            <ProgressList
              items={favoriteServices.map((item) => ({
                color: serviceColorsByName.get(normalizeLookupKey(item.label)) ?? pickStableSeriesColor(item.label),
                label: item.label,
                value: item.value,
                valueLabel: `${formatNumber(item.value)} раз`
              }))}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function AnalyticsKpiRow({ items }: { items: KpiCardItem[] }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {items.map((item) => (
        <AnalyticsMetricCard key={item.key} item={item} />
      ))}
    </div>
  );
}

function AnalyticsMetricCard({ item }: { item: KpiCardItem }) {
  const content = (
    <div
      className={cn(
        "glass-panel h-full min-w-0 rounded-2xl border border-border/80 bg-surface/95 p-5 transition-colors",
        item.onClick ? "cursor-pointer hover:bg-surface-2/60" : "cursor-default"
      )}
    >
      <div className="text-sm text-muted-foreground">{item.label}</div>
      <div className={cn("mt-4 text-3xl font-semibold tracking-tight text-foreground", item.valueClassName)}>{item.value}</div>
      {item.caption ? <div className={cn("mt-3 text-xs", toneTextClassName(item.tone))}>{item.caption}</div> : <div className="mt-3 text-xs text-muted-foreground">Реальные данные текущего периода</div>}
    </div>
  );

  if (!item.onClick) {
    return content;
  }

  return (
    <button type="button" onClick={item.onClick} className="min-w-0 text-left">
      {content}
    </button>
  );
}

function SimpleRankingCard({
  items,
  title
}: {
  items: Array<AnalyticsTopCategory | AnalyticsTopClient | AnalyticsTopService>;
  title: string;
}) {
  return (
    <SectionCard title={title}>
      {items.length ? (
        <ExpandableStack
          items={items}
          itemKey={(item, index) => readRankingKey(item, index)}
          renderItem={(item, index) => (
            <div key={readRankingKey(item, index)} className="flex items-start justify-between gap-3 rounded-2xl border border-border/80 bg-surface/65 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{readRankingTitle(item)}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{readRankingSubtitle(item)}</div>
              </div>
              <div className="text-sm font-semibold text-foreground">{readRankingValue(item)}</div>
            </div>
          )}
        />
      ) : (
        <EmptyState title="Нет данных" description="Для выбранного периода пока нечего показать." />
      )}
    </SectionCard>
  );
}

function ExpandableStack<T>({
  items,
  itemKey,
  renderItem,
  visibleCount = 5
}: {
  items: T[];
  itemKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  visibleCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCollapsible = items.length > visibleCount;
  const visibleItems = expanded || !isCollapsible ? items : items.slice(0, visibleCount);

  return (
    <div className="space-y-3">
      {visibleItems.map((item, index) => (
        <div key={itemKey(item, index)}>{renderItem(item, index)}</div>
      ))}

      {isCollapsible ? (
        <AppButton type="button" variant="ghost" onClick={() => setExpanded((current) => !current)} className="w-full justify-center">
          {expanded ? "Свернуть" : "Развернуть полностью"}
        </AppButton>
      ) : null}
    </div>
  );
}

function ProgressList({
  items,
  maxValue,
  visibleCount = 5
}: {
  items: Array<{ color: string; label: string; value: number; valueLabel: string }>;
  maxValue?: number;
  visibleCount?: number;
}) {
  if (!items.length) {
    return <EmptyState title="Нет данных" description="За выбранный период список пуст." />;
  }

  const [expanded, setExpanded] = useState(false);
  const resolvedMax = maxValue && maxValue > 0 ? maxValue : Math.max(...items.map((item) => item.value), 0);
  const isCollapsible = items.length > visibleCount;
  const visibleItems = expanded || !isCollapsible ? items : items.slice(0, visibleCount);

  return (
    <div className="space-y-3">
      {visibleItems.map((item) => {
        const ratio = resolvedMax > 0 ? (item.value / resolvedMax) * 100 : 0;
        const width = ratio > 0 ? `${Math.min(100, Math.max(ratio, 5))}%` : "0%";
        return (
          <div key={`${item.label}:${item.valueLabel}`} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-foreground">{item.label}</span>
              <span className="shrink-0 text-sm font-semibold text-foreground">{item.valueLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2/90">
              <div className="h-2 rounded-full transition-[width] duration-300" style={{ backgroundColor: item.color, width }} />
            </div>
          </div>
        );
      })}

      {isCollapsible ? (
        <AppButton type="button" variant="ghost" onClick={() => setExpanded((current) => !current)} className="w-full justify-center">
          {expanded ? "Свернуть" : "Развернуть полностью"}
        </AppButton>
      ) : null}
    </div>
  );
}

function StatusChip({ fallbackLabel, status }: { fallbackLabel: string; status?: CrmOrderStatus }) {
  const label = status?.display_name ?? fallbackLabel;
  const color = status?.color ?? CHART_COLORS.blue;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: toAlphaColor(color, "20"),
        borderColor: toAlphaColor(color, "3d"),
        color
      }}
    >
      {label}
    </span>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-surface/65 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AnalyticsDetailPanel({
  detailState,
  drilldownRows,
  isLoading,
  isMobile,
  onClose
}: {
  detailState: DetailState | null;
  drilldownRows: Array<{
    amount: string | null;
    date: string | null;
    entity_id: number | null;
    entity_type: string;
    gross_profit: string | null;
    status: string | null;
    subtitle: string | null;
    title: string;
  }>;
  isLoading: boolean;
  isMobile: boolean;
  onClose: () => void;
}) {
  const backdropPointerStartedRef = useRef(false);
  const panelPointerStartedRef = useRef(false);

  if (!detailState) {
    return null;
  }

  const resetPointerState = () => {
    backdropPointerStartedRef.current = false;
    panelPointerStartedRef.current = false;
  };

  const content = (
    <aside className={cn("z-[320] bg-background shadow-panel", isMobile ? "fixed inset-0 h-svh w-full overflow-y-auto" : "fixed right-0 top-0 hidden h-svh w-[420px] overflow-y-auto border-l border-border lg:block")}>
      <div className="sticky top-0 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Детализация</div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{detailState.title}</h2>
            {detailState.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{detailState.subtitle}</p> : null}
          </div>
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </AppButton>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {detailState.mode === "summary" ? (
          <SectionCard title="Сводка">
            <div className="space-y-3">
              {detailState.items.map((item) => (
                <MetricRow key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </SectionCard>
        ) : null}

        {detailState.mode === "drilldown" ? (
          <SectionCard title="Список">
            {isLoading ? (
              <LoadingState title="Загружаем детализацию" description="Собираем список записей по выбранной метрике." />
            ) : drilldownRows.length ? (
              <div className="space-y-3">
                {drilldownRows.map((row, index) => (
                  <div key={`${row.entity_type}:${row.entity_id ?? index}`} className="rounded-2xl border border-border/80 bg-surface/65 px-4 py-3">
                    <div className="text-sm font-semibold text-foreground">{row.title}</div>
                    {row.subtitle ? <div className="mt-1 text-xs text-muted-foreground">{row.subtitle}</div> : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {row.date ? <span>{formatDateTime(row.date)}</span> : null}
                      {row.amount ? <span>{formatCurrency(row.amount)}</span> : null}
                      {row.gross_profit ? <span>Валовая прибыль: {formatCurrency(row.gross_profit)}</span> : null}
                      {row.status ? <span>{row.status}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Нет данных" description="Для выбранной детализации список пуст." />
            )}
          </SectionCard>
        ) : null}
      </div>
    </aside>
  );

  if (isMobile) {
    return <MobileSheet onClose={onClose}>{content}</MobileSheet>;
  }

  return (
    <div
      className="fixed inset-0 z-[310] hidden bg-black/45 backdrop-blur-[2px] lg:block"
      onPointerDown={(event) => {
        backdropPointerStartedRef.current = event.target === event.currentTarget;
        panelPointerStartedRef.current = false;
      }}
      onPointerUp={(event) => {
        const shouldClose = backdropPointerStartedRef.current && !panelPointerStartedRef.current && event.target === event.currentTarget;
        resetPointerState();
        if (shouldClose) {
          onClose();
        }
      }}
      onPointerCancel={resetPointerState}
    >
      <div onPointerDownCapture={() => { panelPointerStartedRef.current = true; }}>{content}</div>
    </div>
  );
}

function resolveAppliedRange(preset: PeriodPreset, dateFrom: string | null, dateTo: string | null, workingMonthStartDay = 25) {
  if (dateFrom && dateTo) {
    return { dateFrom, dateTo };
  }

  const range = resolveAnalyticsPeriodRange(preset, new Date(), workingMonthStartDay);
  return range.dateFrom && range.dateTo ? range : getAnalyticsWorkingMonthRange(new Date(), workingMonthStartDay);
}

function toDateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

function inferOrdersGroup(dateFrom: string, dateTo: string): PeriodGroup {
  return differenceInDays(dateFrom, dateTo) <= 42 ? "day" : "week";
}

function inferLongRangeGroup(dateFrom: string, dateTo: string): PeriodGroup {
  const days = differenceInDays(dateFrom, dateTo);
  if (days <= 31) {
    return "day";
  }
  if (days <= 120) {
    return "week";
  }
  return "month";
}

function differenceInDays(dateFrom: string, dateTo: string) {
  const start = parseDateInput(dateFrom);
  const end = parseDateInput(dateTo);
  return Math.max(Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1, 1);
}

function buildPeriodBuckets(dateFrom: string, dateTo: string, group: PeriodGroup): PeriodBucket[] {
  const start = parseDateInput(dateFrom);
  const end = parseDateInput(dateTo);

  if (group === "month") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const buckets: PeriodBucket[] = [];
    while (cursor <= end) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      buckets.push({
        dateFrom: toDateInput(monthStart),
        dateTo: toDateInput(monthEnd),
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        label: cursor.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")
      });
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
    return buckets;
  }

  if (group === "week") {
    const buckets: PeriodBucket[] = [];
    const cursor = startOfWeek(start);
    while (cursor <= end) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      buckets.push({
        dateFrom: toDateInput(weekStart),
        dateTo: toDateInput(weekEnd),
        key: `${weekStart.getFullYear()}-W${String(getIsoWeek(weekStart)).padStart(2, "0")}`,
        label: `${padDayMonth(weekStart)} - ${padDayMonth(weekEnd)}`
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  const buckets: PeriodBucket[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    buckets.push({
      dateFrom: toDateInput(cursor),
      dateTo: toDateInput(cursor),
      key: toDateInput(cursor),
      label: padDayMonth(cursor)
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

function fillChartPoints(points: AnalyticsChartPoint[], buckets: PeriodBucket[]) {
  const pointMap = new Map(points.map((point) => [point.period_key, point]));
  return buckets.map((bucket) => {
    const point = pointMap.get(bucket.key);
    return {
      finance_expenses: point ? parseMoney(point.finance_expenses) : 0,
      gross_profit: point ? parseMoney(point.gross_profit) : 0,
      net_result: point ? parseMoney(point.net_result) : 0,
      new_clients: point?.new_clients ?? 0,
      orders_count: point?.orders_count ?? 0,
      repeat_clients: point?.repeat_clients ?? 0,
      turnover: point ? parseMoney(point.turnover) : 0
    };
  });
}

function aggregateRowsIntoBuckets<T>(rows: T[], buckets: PeriodBucket[], dateReader: (row: T) => string | null | undefined, valueReader: (row: T) => number) {
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, 0]));
  const inferredGroup = inferGroupFromBuckets(buckets);
  rows.forEach((row) => {
    const rawDate = dateReader(row);
    if (!rawDate) {
      return;
    }
    const date = parseSourceDate(rawDate);
    if (!date) {
      return;
    }
    const key = getBucketKey(date, inferredGroup);
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + valueReader(row));
  });
  return buckets.map((bucket) => bucketMap.get(bucket.key) ?? 0);
}

function mapBucketsToValues(points: AnalyticsChartPoint[], buckets: PeriodBucket[], valueReader: (point: AnalyticsChartPoint) => number) {
  const pointMap = new Map(points.map((point) => [point.period_key, valueReader(point)]));
  return buckets.map((bucket) => pointMap.get(bucket.key) ?? 0);
}

function inferGroupFromBuckets(buckets: PeriodBucket[]): PeriodGroup {
  if (buckets.length <= 1) {
    return "day";
  }
  if (buckets[0]?.key.includes("-W")) {
    return "week";
  }
  if (buckets[0]?.key.length === 7) {
    return "month";
  }
  return "day";
}

function parseSourceDate(value: string) {
  if (!value) {
    return null;
  }
  const normalized = value.length >= 10 ? value.slice(0, 10) : value;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBucketKey(date: Date, group: PeriodGroup) {
  if (group === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  if (group === "week") {
    return `${startOfWeek(date).getFullYear()}-W${String(getIsoWeek(date)).padStart(2, "0")}`;
  }
  return toDateInput(date);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getIsoWeek(date: Date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
}

function padDayMonth(value: Date) {
  return `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function selectChartGroup(groups: { group: string; points: AnalyticsChartPoint[] }[], key: string) {
  return groups.find((group) => group.group === key) ?? groups[0] ?? { group: key, points: [] };
}

function buildStatusLookup(statuses: CrmOrderStatus[]) {
  return new Map(statuses.map((status) => [status.code, status]));
}

function mapKpiToCard(item: AnalyticsDashboard["overview"]["kpis_row_1"][number], onClick?: () => void): KpiCardItem {
  return {
    caption: item.caption,
    key: item.key,
    label: item.label,
    onClick: item.interactive ? onClick : undefined,
    tone: mapKpiTone(item.key),
    value: formatKpiValue(item)
  };
}

function formatKpiValue(item: { kind: string; value: string }) {
  if (item.kind === "money") {
    return formatCurrency(item.value);
  }
  if (item.kind === "percent") {
    return formatPercentValue(parseNumber(item.value), 1);
  }
  if (item.kind === "hours") {
    return formatHoursCompact(parseNumber(item.value));
  }
  return formatNumber(item.value);
}

function mapKpiTone(key: string): KpiCardItem["tone"] {
  if (key.includes("profit") || key.includes("repeat")) {
    return "success";
  }
  if (key.includes("expense") || key.includes("discount") || key.includes("supplies")) {
    return "warning";
  }
  if (key.includes("net")) {
    return "primary";
  }
  if (key.includes("unpaid")) {
    return "danger";
  }
  return "muted";
}

function buildOrdersKpis(rows: AnalyticsOrdersRow[], dashboard: AnalyticsDashboard): KpiCardItem[] {
  const created = parseKpiValue(dashboard.orders.kpis, "orders_created");
  const completed = parseKpiValue(dashboard.orders.kpis, "completed_orders");
  const inProgress = parseKpiValue(dashboard.orders.kpis, "orders_in_progress");
  const unpaid = parseKpiValue(dashboard.orders.kpis, "orders_unpaid");
  const averageCheck = rows.length ? rows.reduce((sum, row) => sum + parseMoney(row.amount_to_pay), 0) / rows.length : 0;
  const averageCompletionHours = rows.length ? rows.reduce((sum, row) => sum + parseNumber(row.completion_hours), 0) / Math.max(rows.filter((row) => row.completion_hours).length, 1) : 0;

  return [
    { key: "orders-created", label: "Создано", value: formatNumber(created) },
    { key: "orders-active", label: "В работе", value: formatNumber(inProgress), tone: "primary" },
    { key: "orders-completed", label: "Завершено", value: formatNumber(completed), tone: "success" },
    { key: "orders-unpaid", label: "Неоплачено", value: formatNumber(unpaid), tone: "warning" },
    { key: "orders-average-check", label: "Средний чек", value: formatCurrency(averageCheck) },
    { key: "orders-average-time", label: "Среднее время", value: formatHoursCompact(averageCompletionHours) }
  ];
}

function buildCompletionCategoryStats(rows: AnalyticsOrdersRow[]) {
  const buckets = new Map<string, { count: number; hours: number }>();
  rows.forEach((row) => {
    if (!row.completion_hours || !row.category_names.length) {
      return;
    }
    const hours = parseNumber(row.completion_hours);
    row.category_names.forEach((name) => {
      const bucket = buckets.get(name) ?? { count: 0, hours: 0 };
      bucket.count += 1;
      bucket.hours += hours;
      buckets.set(name, bucket);
    });
  });
  return [...buckets.entries()].map(([label, bucket]) => ({ hours: bucket.count ? bucket.hours / bucket.count : 0, label })).sort((left, right) => right.hours - left.hours);
}

function buildOrderCategoryStats(rows: AnalyticsOrdersRow[]) {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    row.category_names.forEach((name) => {
      buckets.set(name, (buckets.get(name) ?? 0) + 1);
    });
  });
  return [...buckets.entries()].map(([label, count]) => ({ count, label })).sort((left, right) => right.count - left.count);
}

function buildSupplyCategoryStats(rows: AnalyticsSupplyRow[]) {
  const totalAmount = rows.reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const buckets = new Map<string, { amount: number; categoryId: number | null; quantity: number }>();
  rows.forEach((row) => {
    const bucket = buckets.get(row.category_name) ?? { amount: 0, categoryId: row.category_id, quantity: 0 };
    bucket.amount += parseMoney(row.amount);
    bucket.categoryId ??= row.category_id;
    bucket.quantity += row.quantity;
    buckets.set(row.category_name, bucket);
  });
  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      amount: bucket.amount,
      categoryId: bucket.categoryId,
      label,
      quantity: bucket.quantity,
      share: totalAmount ? (bucket.amount / totalAmount) * 100 : 0
    }))
    .sort((left, right) => right.amount - left.amount);
}

function buildFavoriteServiceStats(rows: AnalyticsClientRow[]) {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    row.favorite_services.forEach((service) => {
      buckets.set(service, (buckets.get(service) ?? 0) + 1);
    });
  });
  return [...buckets.entries()].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value);
}

function buildOrderSummary(row: AnalyticsOrdersRow, statusLookup: StatusLookup) {
  return [
    { label: "Клиент", value: row.client_name },
    { label: "Авто", value: row.vehicle_label },
    { label: "Статус", value: statusLookup.get(row.status)?.display_name ?? row.status },
    { label: "Категории", value: row.category_names.join(", ") || "Без категории" },
    { label: "Услуги", value: formatCurrency(row.services_total) },
    { label: "Сумма расходников", value: formatCurrency(row.materials_total) },
    { label: "Скидка", value: formatCurrency(row.discount_total) },
    { label: "К оплате", value: formatCurrency(row.amount_to_pay) },
    { label: "Валовая прибыль", value: formatCurrency(row.gross_profit) }
  ];
}

function buildServiceCategorySummary(row: AnalyticsServiceCategoryRow) {
  return [
    { label: "Категория", value: row.category_name },
    { label: "Заказов", value: formatNumber(row.orders_count) },
    { label: "Оборот услуг", value: formatCurrency(row.services_total) },
    { label: "Сумма расходников", value: formatCurrency(row.materials_total) },
    { label: "К оплате", value: formatCurrency(row.amount_to_pay) },
    { label: "Валовая прибыль", value: formatCurrency(row.gross_profit) },
    { label: "Маржинальность", value: formatPercentValue(parseNumber(row.margin_percent), 0) }
  ];
}

function buildServiceSummary(row: AnalyticsServiceRow) {
  return [
    { label: "Категория", value: row.category_name },
    { label: "Оказаний", value: formatNumber(row.usage_count) },
    { label: "Оборот", value: formatCurrency(row.revenue) },
    { label: "Средняя цена", value: formatCurrency(row.average_price) },
    { label: "Мин / макс", value: `${formatCurrency(row.min_price)} / ${formatCurrency(row.max_price)}` },
    { label: "Последние заказы", value: row.recent_order_ids.map((id) => `#${id}`).join(", ") || "Нет" }
  ];
}

function buildSupplySummary(row: AnalyticsSupplyRow) {
  return [
    { label: "Материал", value: row.material_name },
    { label: "Дата", value: formatDateTime(row.date) },
    { label: "Категория", value: row.category_name },
    { label: "Количество", value: formatNumber(row.quantity) },
    { label: "Цена", value: formatCurrency(row.unit_price) },
    { label: "Сумма", value: formatCurrency(row.amount) }
  ];
}

function buildFinanceSummary(row: AnalyticsLatestFinance) {
  return [
    { label: "Дата", value: formatDate(row.expense_date) },
    { label: "Категория", value: row.category_name },
    { label: "Комментарий", value: row.comment || "Без комментария" },
    { label: "Сумма", value: formatCurrency(row.amount) },
    { label: "Создал", value: row.created_by_user_name || "Не указано" }
  ];
}

function buildClientSummary(row: AnalyticsClientRow) {
  return [
    { label: "Телефон", value: row.phone },
    { label: "Заказов", value: formatNumber(row.orders_count) },
    { label: "Оборот", value: formatCurrency(row.amount_to_pay) },
    { label: "Средний чек", value: formatCurrency(row.average_check) },
    { label: "LTV", value: formatCurrency(row.ltv) },
    { label: "Активность", value: row.activity_status },
    { label: "Последний визит", value: row.last_visit ? formatDateTime(row.last_visit) : "Нет данных" },
    { label: "Любимые услуги", value: row.favorite_services.join(", ") || "Нет данных" }
  ];
}

function buildOverviewOption({
  buckets,
  grossProfit,
  isMobile,
  netResult,
  turnover
}: {
  buckets: PeriodBucket[];
  grossProfit: number[];
  isMobile: boolean;
  netResult: number[];
  turnover: number[];
}) {
  return {
    animationDuration: 300,
    color: [CHART_COLORS.blue, CHART_COLORS.cyan, CHART_COLORS.orange],
    grid: buildGrid(isMobile),
    legend: buildLegend(["Оборот", "Валовая прибыль", "Чистый результат"]),
    series: [
      buildBarSeries("Оборот", turnover, CHART_COLORS.blue),
      buildBarSeries("Валовая прибыль", grossProfit, CHART_COLORS.cyan),
      buildLineSeries("Чистый результат", netResult, CHART_COLORS.orange)
    ],
    tooltip: buildTooltip((params) => buildSharedTooltip(params, (value) => formatCurrency(Number(value)))),
    xAxis: buildCategoryAxis(buckets.map((bucket) => bucket.label)),
    yAxis: buildValueAxis((value) => shortMoney(value))
  };
}

function buildOrdersDynamicsOption({
  buckets,
  completed,
  created,
  isMobile
}: {
  buckets: PeriodBucket[];
  completed: number[];
  created: number[];
  isMobile: boolean;
}) {
  return {
    animationDuration: 300,
    color: [CHART_COLORS.blue, CHART_COLORS.cyan],
    grid: buildGrid(isMobile),
    legend: buildLegend(["Создано", "Завершено"]),
    series: [
      buildBarSeries("Создано", created, CHART_COLORS.blue),
      buildBarSeries("Завершено", completed, CHART_COLORS.cyan)
    ],
    tooltip: buildTooltip((params) => buildSharedTooltip(params, (value) => `${formatNumber(Number(value))} шт`)),
    xAxis: buildCategoryAxis(buckets.map((bucket) => bucket.label)),
    yAxis: buildValueAxis((value) => formatNumber(value))
  };
}

function buildHorizontalBarOption({
  categories,
  colorBuilder,
  isMobile,
  seriesName,
  valueFormatter,
  values
}: {
  categories: string[];
  colorBuilder: (index: number) => string;
  isMobile: boolean;
  seriesName: string;
  valueFormatter: (value: number) => string;
  values: number[];
}) {
  return {
    animationDuration: 300,
    grid: {
      bottom: 12,
      containLabel: true,
      left: 8,
      right: 12,
      top: 8
    },
    series: [
      {
        barMaxWidth: isMobile ? 18 : 22,
        data: values.map((value, index) => ({
          itemStyle: {
            borderRadius: 999,
            color: colorBuilder(index)
          },
          value
        })),
        name: seriesName,
        type: "bar"
      }
    ],
    tooltip: buildTooltip((params) => buildSharedTooltip(params, (value) => valueFormatter(Number(value)))),
    xAxis: buildValueAxis((value) => shortMoney(value)),
    yAxis: buildCategoryAxis(categories, "y")
  };
}

function buildSingleSeriesBarOption({
  buckets,
  color,
  isMobile,
  seriesName,
  valueFormatter,
  values
}: {
  buckets: PeriodBucket[];
  color: string;
  isMobile: boolean;
  seriesName: string;
  valueFormatter: (value: number) => string;
  values: number[];
}) {
  return {
    animationDuration: 300,
    color: [color],
    grid: buildGrid(isMobile),
    series: [buildBarSeries(seriesName, values, color)],
    tooltip: buildTooltip((params) => buildSharedTooltip(params, (value) => valueFormatter(Number(value)))),
    xAxis: buildCategoryAxis(buckets.map((bucket) => bucket.label)),
    yAxis: buildValueAxis((value) => shortMoney(value))
  };
}

function buildFinancesOption({
  buckets,
  expenses,
  grossProfit,
  isMobile,
  turnover
}: {
  buckets: PeriodBucket[];
  expenses: number[];
  grossProfit: number[];
  isMobile: boolean;
  turnover: number[];
}) {
  return {
    animationDuration: 300,
    color: [CHART_COLORS.cyan, CHART_COLORS.red, CHART_COLORS.blue],
    grid: buildGrid(isMobile),
    legend: buildLegend(["Оборот", "Финансовые расходы", "Валовая прибыль"]),
    series: [
      buildBarSeries("Оборот", turnover, CHART_COLORS.cyan),
      buildBarSeries("Финансовые расходы", expenses, CHART_COLORS.red),
      buildLineSeries("Валовая прибыль", grossProfit, CHART_COLORS.blue)
    ],
    tooltip: buildTooltip((params) => buildSharedTooltip(params, (value) => formatCurrency(Number(value)))),
    xAxis: buildCategoryAxis(buckets.map((bucket) => bucket.label)),
    yAxis: buildValueAxis((value) => shortMoney(value))
  };
}

function buildClientsGrowthOption({
  buckets,
  isMobile,
  newClients,
  repeatClients
}: {
  buckets: PeriodBucket[];
  isMobile: boolean;
  newClients: number[];
  repeatClients: number[];
}) {
  return {
    animationDuration: 300,
    color: [CHART_COLORS.blue, CHART_COLORS.green],
    grid: buildGrid(isMobile),
    legend: buildLegend(["Новые", "Повторные"]),
    series: [
      buildBarSeries("Новые", newClients, CHART_COLORS.blue),
      buildBarSeries("Повторные", repeatClients, CHART_COLORS.green)
    ],
    tooltip: buildTooltip((params) => buildSharedTooltip(params, (value) => `${formatNumber(Number(value))} клиентов`)),
    xAxis: buildCategoryAxis(buckets.map((bucket) => bucket.label)),
    yAxis: buildValueAxis((value) => formatNumber(value))
  };
}

function buildBarSeries(name: string, values: number[], color: string) {
  return {
    barMaxWidth: 24,
    data: values.map((value) => ({
      itemStyle: {
        borderRadius: [10, 10, 0, 0],
        color
      },
      value
    })),
    emphasis: {
      focus: "series"
    },
    name,
    type: "bar"
  };
}

function buildLineSeries(name: string, values: number[], color: string) {
  return {
    data: values,
    emphasis: {
      focus: "series"
    },
    lineStyle: {
      color,
      width: 3
    },
    name,
    showSymbol: false,
    smooth: 0.3,
    symbolSize: 8,
    type: "line"
  };
}

function buildLegend(data: string[]) {
  return {
    data,
    itemGap: 18,
    right: 0,
    textStyle: {
      color: CHART_COLORS.muted,
      fontSize: 12
    },
    top: 0
  };
}

function buildGrid(isMobile: boolean) {
  return {
    bottom: isMobile ? 28 : 22,
    containLabel: true,
    left: isMobile ? 6 : 4,
    right: isMobile ? 12 : 10,
    top: 44
  };
}

function buildCategoryAxis(labels: string[], axis: "x" | "y" = "x") {
  const config = {
    axisLabel: {
      color: CHART_COLORS.muted,
      fontSize: 11,
      hideOverlap: true
    },
    axisLine: {
      lineStyle: {
        color: CHART_COLORS.grid
      }
    },
    axisTick: {
      show: false
    },
    data: labels,
    type: "category"
  };
  return axis === "x" ? config : { ...config, inverse: true };
}

function buildValueAxis(formatter: (value: number) => string) {
  return {
    axisLabel: {
      color: CHART_COLORS.muted,
      fontSize: 11,
      formatter
    },
    splitLine: {
      lineStyle: {
        color: CHART_COLORS.grid
      }
    },
    type: "value"
  };
}

function buildTooltip(formatter: (params: unknown) => string) {
  return {
    backgroundColor: CHART_COLORS.tooltipBackground,
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    confine: true,
    formatter,
    textStyle: {
      color: CHART_COLORS.text,
      fontSize: 12
    },
    trigger: "axis"
  };
}

function buildSharedTooltip(params: unknown, valueFormatter: (value: unknown) => string) {
  const items = Array.isArray(params) ? params : [params];
  const first = items[0] as { axisValueLabel?: string } | undefined;
  const lines = items
    .map((item) => {
      const typed = item as { color?: string; seriesName?: string; value?: unknown };
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:6px;"><span style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${typed.color ?? CHART_COLORS.blue};"></span><span>${typed.seriesName ?? ""}</span></span><strong>${valueFormatter(typed.value)}</strong></div>`;
    })
    .join("");
  return `<div style="min-width:180px;"><div style="font-weight:600;">${first?.axisValueLabel ?? ""}</div>${lines}</div>`;
}

function readBucketFromChartClick(params: { dataIndex?: number; seriesName?: string }, buckets: PeriodBucket[]) {
  if (typeof params.dataIndex !== "number") {
    return null;
  }
  return buckets[params.dataIndex] ?? null;
}

function resolveOverviewDrilldownMetric(seriesName?: string) {
  if (seriesName === "Оборот") {
    return "turnover";
  }
  if (seriesName === "Валовая прибыль") {
    return "gross_profit";
  }
  if (seriesName === "Чистый результат") {
    return "net_result";
  }
  return null;
}

function readRankingKey(item: AnalyticsTopCategory | AnalyticsTopClient | AnalyticsTopService, index: number) {
  if ("service_name" in item) {
    return `${item.service_name}:${index}`;
  }
  if ("client_id" in item) {
    return `${item.client_id}:${index}`;
  }
  return `${item.category_id ?? "na"}:${index}`;
}

function readRankingTitle(item: AnalyticsTopCategory | AnalyticsTopClient | AnalyticsTopService) {
  if ("service_name" in item) {
    return item.service_name;
  }
  if ("client_id" in item) {
    return item.client_name;
  }
  return item.category_name;
}

function readRankingSubtitle(item: AnalyticsTopCategory | AnalyticsTopClient | AnalyticsTopService) {
  if ("service_name" in item) {
    return `${item.category_name} • ${formatNumber(item.usage_count)} раз`;
  }
  if ("client_id" in item) {
    return `${formatNumber(item.orders_count)} заказов • валовая прибыль ${formatCurrency(item.gross_profit)}`;
  }
  return `${formatNumber(item.orders_count)} заказов • валовая прибыль ${formatCurrency(item.gross_profit)}`;
}

function readRankingValue(item: AnalyticsTopCategory | AnalyticsTopClient | AnalyticsTopService) {
  if ("service_name" in item) {
    return formatCurrency(item.revenue);
  }
  if ("client_id" in item) {
    return formatCurrency(item.turnover);
  }
  return formatCurrency(item.turnover);
}

function parseMoney(value: string | number | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function parseNumber(value: string | number | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function parseKpiValue(items: AnalyticsDashboard["orders"]["kpis"] | AnalyticsDashboard["overview"]["kpis_row_1"], key: string) {
  return parseNumber(items.find((item) => item.key === key)?.value ?? 0);
}

function parseKpiMoney(items: AnalyticsDashboard["overview"]["kpis_row_1"], key: string) {
  return parseMoney(items.find((item) => item.key === key)?.value ?? 0);
}

function formatPercentValue(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatSignedCurrency(value: string | number) {
  const amount = parseMoney(value);
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${formatCurrency(amount)}`;
}

function formatHoursCompact(hours: number) {
  if (!hours) {
    return "0 ч";
  }
  if (hours >= 24) {
    return `${(hours / 24).toFixed(1)} дн.`;
  }
  return `${hours.toFixed(1)} ч`;
}

function shortMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }
  return formatNumber(value);
}

function toneTextClassName(tone?: KpiCardItem["tone"]) {
  if (tone === "success") {
    return "text-success";
  }
  if (tone === "warning") {
    return "text-warning";
  }
  if (tone === "danger") {
    return "text-danger";
  }
  if (tone === "primary") {
    return "text-[#58A8F3]";
  }
  return "text-muted-foreground";
}

function toAlphaColor(color: string, alphaHex: string) {
  if (/^#[\da-f]{6}$/i.test(color)) {
    return `${color}${alphaHex}`;
  }
  return color;
}

function buildCategoryColorLookup(categories: ServiceCategory[]): CategoryColorLookup {
  const byId = new Map<number, string>();
  const byName = new Map<string, string>();
  categories.forEach((category) => {
    byId.set(category.id, category.color);
    byName.set(normalizeLookupKey(category.name), category.color);
  });
  return { byId, byName };
}

function buildServiceColorLookup(rows: AnalyticsServiceRow[], categoryColors: CategoryColorLookup) {
  const lookup = new Map<string, string>();
  rows.forEach((row) => {
    lookup.set(
      normalizeLookupKey(row.service_name),
      resolveCategoryColor(categoryColors, { id: row.category_id, name: row.category_name }, row.service_name)
    );
  });
  return lookup;
}

function normalizeLookupKey(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function resolveCategoryColor(
  lookup: CategoryColorLookup,
  category: { id?: number | null; name?: string | null },
  fallbackSeed?: string
) {
  if (typeof category.id === "number") {
    const color = lookup.byId.get(category.id);
    if (color) {
      return color;
    }
  }

  const normalizedName = normalizeLookupKey(category.name);
  if (normalizedName) {
    const color = lookup.byName.get(normalizedName);
    if (color) {
      return color;
    }
    return pickStableSeriesColor(normalizedName);
  }

  return pickStableSeriesColor(fallbackSeed ?? "default");
}

function resolveClientSegmentColor(segmentKey: string) {
  if (segmentKey === "new") {
    return CHART_COLORS.blue;
  }
  if (segmentKey === "regular") {
    return CHART_COLORS.green;
  }
  if (segmentKey === "vip") {
    return CHART_COLORS.purple;
  }
  if (segmentKey === "lost") {
    return CHART_COLORS.red;
  }
  return CHART_COLORS.orange;
}

function pickStableSeriesColor(seed: string) {
  const palette = [CHART_COLORS.blue, CHART_COLORS.cyan, CHART_COLORS.orange, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.red];
  const normalized = normalizeLookupKey(seed);
  const hash = [...normalized].reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? CHART_COLORS.blue;
}
