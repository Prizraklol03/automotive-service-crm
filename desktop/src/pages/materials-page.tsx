import { useEffect, useMemo } from "react";
import { Landmark, Package, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useCan } from "@/features/auth/model/permissions";
import { useMaterialsInfiniteQuery, useMaterialsSummaryQuery } from "@/features/materials/api/materials-hooks";
import { MaterialDetailPanel } from "@/features/materials/ui/material-detail-panel";
import { useVisualConfigQuery } from "@/features/settings/api/settings-hooks";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelect } from "@/shared/ui/app-select";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import {
  ANALYTICS_PERIOD_PRESET_OPTIONS,
  type AnalyticsPeriodPreset,
  getAnalyticsWorkingMonthRange,
  resolveAnalyticsPeriodRange
} from "@/shared/lib/analytics-period";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { LoadingState } from "@/shared/ui/loading-state";
import { InfiniteScrollFooter } from "@/shared/ui/infinite-scroll-footer";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { PeriodRangePanel } from "@/shared/ui/period-range-panel";
import { StatCard } from "@/shared/ui/stat-card";

const DEFAULT_PAGE_SIZE = 50;

export function MaterialsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const canManageMaterials = useCan("materials.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const visualQuery = useVisualConfigQuery();
  const workingMonthStartDay = visualQuery.data?.working_month_start_day ?? 25;

  const materialKey = searchParams.get("material");
  const rawDateFrom = searchParams.get("dateFrom") ?? "";
  const rawDateTo = searchParams.get("dateTo") ?? "";
  const periodParam = searchParams.get("period") as AnalyticsPeriodPreset | null;
  const period = periodParam ?? (rawDateFrom || rawDateTo ? "custom" : "working_month");
  const defaultPeriod = useMemo(() => getAnalyticsWorkingMonthRange(new Date(), workingMonthStartDay), [workingMonthStartDay]);
  const resolvedRange = useMemo(() => {
    if (period === "custom") {
      return { dateFrom: rawDateFrom, dateTo: rawDateTo };
    }
    return resolveAnalyticsPeriodRange(period, new Date(), workingMonthStartDay);
  }, [period, rawDateFrom, rawDateTo, workingMonthStartDay]);
  const dateFrom = resolvedRange.dateFrom || defaultPeriod.dateFrom;
  const dateTo = resolvedRange.dateTo || defaultPeriod.dateTo;

  const resetListScroll = () => {
    try {
      window.scrollTo(0, 0);
    } catch {
      // jsdom does not implement scrollTo.
    }
  };

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (next.has("page") || next.has("pageSize")) {
      next.delete("page");
      next.delete("pageSize");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const materialsQuery = useMaterialsInfiniteQuery({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const summaryQuery = useMaterialsSummaryQuery({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined
  });

  const materials = materialsQuery.items;
  const totalAmount = summaryQuery.data?.total_amount ?? null;
  const categorySummaries = summaryQuery.data?.categories ?? [];

  const grouped = useMemo(() => {
    const buckets = new Map<string, typeof materials>();
    materials.forEach((material) => {
      const bucket = buckets.get(material.expense_date) ?? [];
      bucket.push(material);
      buckets.set(material.expense_date, bucket);
    });
    return Array.from(buckets.entries());
  }, [materials]);

  const updateMaterialKey = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("material", value);
    } else {
      next.delete("material");
    }
    setSearchParams(next, { replace: true });
  };

  const updateDateParam = (key: "dateFrom" | "dateTo", value?: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set("period", "custom");
    next.delete("page");
    next.delete("pageSize");
    setSearchParams(next, { replace: true });
    resetListScroll();
  };

  const applyPeriod = (nextPeriod: AnalyticsPeriodPreset) => {
    const next = new URLSearchParams(searchParams);
    next.set("period", nextPeriod);
    if (nextPeriod === "custom") {
      next.set("dateFrom", dateFrom);
      next.set("dateTo", dateTo);
    } else {
      const range = resolveAnalyticsPeriodRange(nextPeriod, new Date(), workingMonthStartDay);
      next.set("dateFrom", range.dateFrom);
      next.set("dateTo", range.dateTo);
    }
    setSearchParams(next, { replace: true });
    resetListScroll();
  };

  const resetPeriod = () => {
    const range = getAnalyticsWorkingMonthRange(new Date(), workingMonthStartDay);
    const next = new URLSearchParams(searchParams);
    next.set("dateFrom", range.dateFrom);
    next.set("dateTo", range.dateTo);
    next.set("period", "working_month");
    next.delete("page");
    next.delete("pageSize");
    setSearchParams(next, { replace: true });
    resetListScroll();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Материалы"
        description="Журнал расходных материалов по датам и категориям."
        actions={
          <div className={isMobile ? "grid w-full gap-2" : "flex items-center gap-2"}>
            <AppSelect
              className="lg:w-[220px]"
              value={period}
              onChange={(event) => applyPeriod(event.target.value as AnalyticsPeriodPreset)}
            >
              {ANALYTICS_PERIOD_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </AppSelect>
            {canManageMaterials ? (
              <AppButton onClick={() => updateMaterialKey("new")}>
                <Plus className="h-4 w-4" />
                Добавить материал
              </AppButton>
            ) : null}
          </div>
        }
      />

      <PeriodRangePanel
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(event) => updateDateParam("dateFrom", event.target.value || null)}
        onDateToChange={(event) => updateDateParam("dateTo", event.target.value || null)}
        onReset={resetPeriod}
      />

      {summaryQuery.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Общая сумма материалов за период"
            value={formatCurrency(totalAmount ?? 0)}
            hint={`${formatDate(dateFrom)} - ${formatDate(dateTo)}`}
            trend={<Landmark className="h-4 w-4" />}
          />
          {categorySummaries.map((summary) => (
            <StatCard
              key={summary.categoryId ?? "uncategorized"}
              label={summary.name}
              value={formatCurrency(summary.amount)}
              hint={`${formatNumber(summary.rows)} ${summary.rows === 1 ? "строка" : summary.rows < 5 ? "строки" : "строк"}`}
              trend={<Package className="h-4 w-4" />}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-panel rounded-2xl p-5">
              <div className="h-3 w-24 rounded-full bg-surface-2" />
              <div className="mt-4 h-8 w-28 rounded-full bg-surface-2" />
              <div className="mt-3 h-2 w-40 rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      {materialsQuery.isLoading && !materialsQuery.data ? <LoadingState title="Загружаем материалы" description="Собираем список по датам." /> : null}
      {materialsQuery.isError && !materialsQuery.data ? (
        <ErrorState
          title="Не удалось загрузить материалы"
          description="Проверьте подключение и попробуйте снова."
          actionLabel="Повторить"
          onAction={() => void materialsQuery.refetch()}
        />
      ) : null}

      {!materialsQuery.isLoading && materialsQuery.data ? (
        materials.length ? (
          <>
            {materialsQuery.isError ? (
              <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                Последние данные показаны из кэша. Не удалось обновить список материалов.
              </div>
            ) : null}

            <div className="space-y-4">
              {grouped.map(([expenseDate, dayMaterials]) => (
                <section key={expenseDate} className="glass-panel overflow-hidden rounded-2xl">
                  <div className="border-b border-border px-4 py-4">
                    <h2 className="text-base font-semibold">Материалы от {formatDate(expenseDate)}</h2>
                  </div>
                  <div className="divide-y divide-border">
                    {dayMaterials.map((material) => (
                      <button
                        key={material.id}
                        type="button"
                        onClick={() => updateMaterialKey(String(material.id))}
                        className="grid w-full gap-3 px-4 py-4 text-left text-sm transition-colors hover:bg-surface-2/50 md:grid-cols-[minmax(0,1.4fr)_120px_100px_140px_minmax(0,1fr)]"
                      >
                        <div className="font-medium">{material.material_name}</div>
                        <div className="text-muted-foreground">{formatCurrency(material.unit_price)}</div>
                        <div className="text-muted-foreground">{material.quantity}</div>
                        <div className="font-medium">{formatCurrency(material.row_total)}</div>
                        <div className="text-muted-foreground">{material.service_category_name ?? "Без категории"}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <InfiniteScrollFooter
              className="mt-4"
              hasNextPage={materialsQuery.hasNextPage ?? false}
              isFetchNextPageError={materialsQuery.isFetchNextPageError}
              isFetchingNextPage={materialsQuery.isFetchingNextPage}
              loadedCount={materialsQuery.loadedCount}
              onLoadMore={() => void materialsQuery.fetchNextPage()}
              onRetry={() => void materialsQuery.fetchNextPage()}
              total={materialsQuery.total}
            />
          </>
        ) : (
          <EmptyState
            title="Материалов пока нет"
            description="Добавьте первую запись в журнал материалов."
            action={
              canManageMaterials ? (
                <AppButton onClick={() => updateMaterialKey("new")}>
                  <Package className="h-4 w-4" />
                  Добавить материал
                </AppButton>
              ) : null
            }
          />
        )
      ) : null}

      <MaterialDetailPanel materialKey={materialKey} isMobile={isMobile} onClose={() => updateMaterialKey(null)} />
    </PageContainer>
  );
}
