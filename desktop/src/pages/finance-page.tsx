import { Landmark, Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useCan } from "@/features/auth/model/permissions";
import { FinanceCategoriesModal } from "@/features/finance/ui/finance-categories-modal";
import { FinanceExpenseModal } from "@/features/finance/ui/finance-expense-modal";
import { useFinanceExpensesInfiniteQuery, useFinanceSummaryQuery } from "@/features/finance/api/finance-hooks";
import { useVisualConfigQuery } from "@/features/settings/api/settings-hooks";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import {
  ANALYTICS_PERIOD_PRESET_OPTIONS,
  type AnalyticsPeriodPreset,
  getAnalyticsWorkingMonthRange,
  resolveAnalyticsPeriodRange
} from "@/shared/lib/analytics-period";
import { formatCurrency, formatDate } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelect } from "@/shared/ui/app-select";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { InfiniteScrollFooter } from "@/shared/ui/infinite-scroll-footer";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { PeriodRangePanel } from "@/shared/ui/period-range-panel";
import { StatCard } from "@/shared/ui/stat-card";

const DEFAULT_PAGE_SIZE = 50;

export function FinancePage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const canCreateExpense = useCan("finance.expenses.create");
  const [searchParams, setSearchParams] = useSearchParams();
  const visualQuery = useVisualConfigQuery();
  const workingMonthStartDay = visualQuery.data?.working_month_start_day ?? 25;

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
  const expenseKey = searchParams.get("expense");
  const categoriesOpen = searchParams.get("categories") === "1";

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (next.has("page") || next.has("pageSize")) {
      next.delete("page");
      next.delete("pageSize");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const resetListScroll = () => {
    try {
      window.scrollTo(0, 0);
    } catch {
      // jsdom does not implement scrollTo.
    }
  };

  const filters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined
  };

  const expensesQuery = useFinanceExpensesInfiniteQuery({
    ...filters,
    pageSize: DEFAULT_PAGE_SIZE
  });
  const summaryQuery = useFinanceSummaryQuery(filters);

  const updateSearchParam = (key: string, value?: string | null, options: { resetScroll?: boolean } = {}) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    next.delete("pageSize");
    if (options.resetScroll) {
      resetListScroll();
    }
    if (key === "dateFrom" || key === "dateTo") {
      next.set("period", "custom");
    }
    setSearchParams(next, { replace: true });
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

  const expenses = expensesQuery.items;
  const summaryAmount = summaryQuery.data?.total_amount ?? null;

  return (
    <PageContainer>
      <PageHeader
        title="Финансы"
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
            <div className="flex flex-wrap gap-2">
              <AppButton type="button" variant="subtle" onClick={() => updateSearchParam("categories", "1")}>
                Категории
              </AppButton>
              {canCreateExpense ? (
                <AppButton type="button" onClick={() => updateSearchParam("expense", "new")}>
                  <Plus className="h-4 w-4" />
                  Добавить финансовый расход
                </AppButton>
              ) : null}
            </div>
          </div>
        }
      />

      <PeriodRangePanel
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(event) => updateSearchParam("dateFrom", event.target.value || null)}
        onDateToChange={(event) => updateSearchParam("dateTo", event.target.value || null)}
        onReset={resetPeriod}
      />

      {summaryQuery.data ? (
        <section className="grid gap-4 xl:max-w-xl">
          <StatCard
            label="Общая сумма расходов за период"
            hint={`${formatDate(dateFrom)} - ${formatDate(dateTo)}`}
            trend={<Landmark className="h-4 w-4" />}
            value={formatCurrency(summaryAmount ?? 0)}
          />
        </section>
      ) : (
        <section className="grid gap-4 xl:max-w-xl">
          <div className="glass-panel rounded-2xl p-5">
            <div className="h-3 w-24 rounded-full bg-surface-2" />
            <div className="mt-4 h-8 w-32 rounded-full bg-surface-2" />
            <div className="mt-3 h-2 w-40 rounded-full bg-surface-2" />
          </div>
        </section>
      )}

      {expensesQuery.isLoading && !expensesQuery.data ? <LoadingState title="Загружаем финансы" description="Собираем расходы за выбранный период." /> : null}
      {expensesQuery.isError && !expensesQuery.data ? (
        <ErrorState
          title="Не удалось загрузить расходы"
          description="Проверьте подключение и попробуйте снова."
          actionLabel="Повторить"
          onAction={() => void expensesQuery.refetch()}
        />
      ) : null}

      {!expensesQuery.isLoading && expensesQuery.data ? (
        expenses.length ? (
          <>
            {expensesQuery.isError ? (
              <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                Последние данные показаны из кэша. Не удалось обновить список расходов.
              </div>
            ) : null}

            <section className="glass-panel hidden overflow-hidden rounded-2xl lg:block">
              <div className="grid grid-cols-[140px_220px_minmax(0,1fr)_160px] gap-4 border-b border-border bg-surface-2/70 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <div>Дата</div>
                <div>Категория</div>
                <div>Комментарий</div>
                <div className="text-right">Сумма</div>
              </div>
              <div className="divide-y divide-border">
                {expenses.map((expense) => (
                  <button
                    key={expense.id}
                    className="grid w-full grid-cols-[140px_220px_minmax(0,1fr)_160px] gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/50"
                    onClick={() => updateSearchParam("expense", String(expense.id))}
                    type="button"
                  >
                    <div className="text-sm text-foreground">{formatDate(expense.expense_date)}</div>
                    <div className="text-sm font-medium text-foreground">{expense.category_name}</div>
                    <div className="min-w-0 text-sm text-muted-foreground">{expense.comment || "Без комментария"}</div>
                    <div className="text-right text-sm font-semibold text-foreground">{formatCurrency(expense.amount)}</div>
                  </button>
                ))}
              </div>
            </section>

            <div className="space-y-3 lg:hidden">
              {expenses.map((expense) => (
                <button
                  key={expense.id}
                  className="glass-panel w-full rounded-2xl p-4 text-left"
                  onClick={() => updateSearchParam("expense", String(expense.id))}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{expense.category_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(expense.expense_date)}</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(expense.amount)}</p>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{expense.comment || "Без комментария"}</p>
                </button>
              ))}
            </div>

            <InfiniteScrollFooter
              className="mt-4"
              hasNextPage={expensesQuery.hasNextPage ?? false}
              isFetchNextPageError={expensesQuery.isFetchNextPageError}
              isFetchingNextPage={expensesQuery.isFetchingNextPage}
              loadedCount={expensesQuery.loadedCount}
              onLoadMore={() => void expensesQuery.fetchNextPage()}
              onRetry={() => void expensesQuery.fetchNextPage()}
              total={expensesQuery.total}
            />
          </>
        ) : (
          <EmptyState
            title="Финансовых расходов пока нет"
            description="Добавьте первую запись, чтобы начать учитывать постоянные и разовые затраты."
            action={
              canCreateExpense ? (
                <AppButton type="button" onClick={() => updateSearchParam("expense", "new")}>
                  <Plus className="h-4 w-4" />
                  Добавить финансовый расход
                </AppButton>
              ) : null
            }
          />
        )
      ) : null}

      <FinanceExpenseModal expenseKey={expenseKey} isMobile={isMobile} onClose={() => updateSearchParam("expense", null)} />
      <FinanceCategoriesModal isMobile={isMobile} onClose={() => updateSearchParam("categories", null)} open={categoriesOpen} />
    </PageContainer>
  );
}
