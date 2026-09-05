import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { getOrderRequest, type OrderFilters } from "@/entities/order/api/order-api";
import type { OrderStatus } from "@/entities/order/model/types";
import { useCan } from "@/features/auth/model/permissions";
import { orderDetailQueryKey, useOrderListSummaryQuery, useOrdersInfiniteQuery } from "@/features/orders/api/orders-hooks";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { OrdersList } from "@/features/orders/ui/orders-list";
import { OrdersListSkeleton } from "@/features/orders/ui/orders-list-skeleton";
import { OrdersFilterSortPanel, countActiveOrderFilters } from "@/features/orders/ui/orders-filter-sort-panel";
import {
  DEFAULT_ORDER_SORTS,
  normalizeOrderSortDescriptors,
  toggleOrderSort,
  type OrderSortDescriptor
} from "@/features/orders/model/order-sorting";
import { useOrderStatusesQuery, useUpdateUserPreferencesMutation, useUserPreferencesQuery } from "@/features/settings/api/settings-hooks";
import { ARCHIVED_GROUPS } from "@/entities/settings/model/types";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { useOrdersViewMode } from "@/shared/hooks/use-orders-view-mode";
import { cn } from "@/shared/lib/cn";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { InfiniteScrollFooter } from "@/shared/ui/infinite-scroll-footer";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard } from "@/shared/ui/stat-card";

type ArchiveFilter = "active" | "archived" | "all";
type FilterItem = { label: string; value: OrderStatus; statusGroup: string };

export function OrdersPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const { mode: ordersViewMode } = useOrdersViewMode();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [sortDescriptors, setSortDescriptors] = useState<OrderSortDescriptor[]>(DEFAULT_ORDER_SORTS);
  const [additionalFilters, setAdditionalFilters] = useState<OrderFilters>({});
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const userPreferencesQuery = useUserPreferencesQuery();
  const updatePreferencesMutation = useUpdateUserPreferencesMutation();
  const orderStatusesQuery = useOrderStatusesQuery();
  const canCreateOrder = useCan("orders.create");

  const allStatusFilters = useMemo<FilterItem[]>(
    () =>
      (orderStatusesQuery.data ?? []).map((status) => ({
        label: status.display_name,
        statusGroup: status.status_group,
        value: status.code
      })),
    [orderStatusesQuery.data]
  );

  const archivedParam = (searchParams.get("archived") as ArchiveFilter | null) ?? "active";
  const statusParam = searchParams.get("status");
  const visibleStatusFilters = useMemo(() => {
    if (archivedParam === "all") {
      return allStatusFilters;
    }

    if (archivedParam === "archived") {
      return allStatusFilters.filter((item) => ARCHIVED_GROUPS.includes(item.statusGroup as typeof ARCHIVED_GROUPS[number]));
    }

    return allStatusFilters.filter((item) => !ARCHIVED_GROUPS.includes(item.statusGroup as typeof ARCHIVED_GROUPS[number]));
  }, [allStatusFilters, archivedParam]);
  const statusFilters = useMemo(
    () =>
      (statusParam?.split(",").filter((value): value is OrderStatus =>
        visibleStatusFilters.some((item) => item.value === value)
      ) ?? []),
    [statusParam, visibleStatusFilters]
  );
  const selectedOrderKey = searchParams.get("order");
  const normalizedSearch = deferredSearch.trim();

  const ordersQuery = useOrdersInfiniteQuery({
    ...additionalFilters,
    archivedScope: archivedParam,
    pageSize: 50,
    search: normalizedSearch,
    sortDescriptors,
    status: statusFilters
  });
  const summaryQuery = useOrderListSummaryQuery({
    archivedScope: archivedParam,
    search: normalizedSearch
  });

  useEffect(() => {
    if (userPreferencesQuery.data?.order_sorting) {
      setSortDescriptors(normalizeOrderSortDescriptors(userPreferencesQuery.data.order_sorting));
    }
  }, [userPreferencesQuery.data]);

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

  const handleToggleSort = (key: OrderSortDescriptor["key"]) => {
    setSortDescriptors((current) => toggleOrderSort(current, key));
    resetListScroll();
  };

  const handleApplyFiltersAndSorting = (filters: OrderFilters, descriptors: OrderSortDescriptor[]) => {
    setAdditionalFilters(filters);
    setSortDescriptors(descriptors.length ? descriptors : DEFAULT_ORDER_SORTS);
    setIsFilterPanelOpen(false);
    resetListScroll();
  };

  const updateParam = (key: string, value?: string, options: { resetScroll?: boolean } = {}) => {
    const next = new URLSearchParams(searchParams);

    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    if (key !== "order") {
      next.delete("order");
    }

    next.delete("page");
    next.delete("pageSize");

    if (options.resetScroll) {
      resetListScroll();
    }

    setSearchParams(next, { replace: true });
  };

  const setArchiveFilter = (value: ArchiveFilter) => {
    const nextVisibleFilters =
      value === "all"
        ? allStatusFilters
        : value === "archived"
          ? allStatusFilters.filter((item) => ARCHIVED_GROUPS.includes(item.statusGroup as typeof ARCHIVED_GROUPS[number]))
          : allStatusFilters.filter((item) => !ARCHIVED_GROUPS.includes(item.statusGroup as typeof ARCHIVED_GROUPS[number]));
    const nextStatusFilters = statusFilters.filter((status) => nextVisibleFilters.some((item) => item.value === status));

    const next = new URLSearchParams(searchParams);
    if (value === "active") {
      next.delete("archived");
    } else {
      next.set("archived", value);
    }

    if (nextStatusFilters.length) {
      next.set("status", nextStatusFilters.join(","));
    } else {
      next.delete("status");
    }

    next.delete("order");
    next.delete("page");
    next.delete("pageSize");
    setSearchParams(next, { replace: true });
    resetListScroll();
  };

  const toggleStatusFilter = (value: OrderStatus) => {
    const nextValues = statusFilters.includes(value) ? statusFilters.filter((item) => item !== value) : [...statusFilters, value];
    updateParam("status", nextValues.length ? nextValues.join(",") : undefined, { resetScroll: true });
  };

  const handleOpenOrder = (orderId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("order", String(orderId));
    setSearchParams(next, { replace: true });
  };

  const handlePrefetchOrder = (orderId: number) => {
    void queryClient.prefetchQuery({
      queryKey: orderDetailQueryKey(orderId),
      queryFn: () => getOrderRequest(orderId),
      staleTime: 30_000
    });
  };

  const handleCloseOrder = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const handleCreateOrder = () => {
    const next = new URLSearchParams(searchParams);
    next.set("order", "new");
    setSearchParams(next, { replace: true });
  };

  const orders = ordersQuery.items;
  const summary = summaryQuery.data;
  const archiveCounts = {
    active: summary?.active_total ?? 0,
    all: summary?.total ?? 0,
    archived: summary?.archived_total ?? 0
  };
  const statusCounts = summary?.status_counts ?? {};
  const activeAdditionalFilterCount = countActiveOrderFilters(additionalFilters);
  const hasCustomSorting = !isSameSorting(sortDescriptors, DEFAULT_ORDER_SORTS);

  return (
    <PageContainer>
      <PageHeader
        title="Заказы"
        description="Управление заказами на обслуживание"
        actions={
          <>
            <AppButton variant="outline" onClick={() => void ordersQuery.refetch()}>
              Обновить
            </AppButton>
            {canCreateOrder ? (
              <AppButton onClick={handleCreateOrder}>
                <Plus className="h-4 w-4" />
                Новый заказ
              </AppButton>
            ) : null}
          </>
        }
      />

      {summary ? (
        <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Активные заказы" value={formatNumber(summary.active_total)} hint="Всего открытых заказов" />
          <StatCard label="В работе" value={formatNumber(summary.active_in_progress_total)} hint="Выполняются сейчас" />
          <StatCard label="Новые" value={formatNumber(summary.active_waiting_total)} hint="Ещё не взяты в работу" />
          <StatCard label="К оплате" value={formatCurrency(summary.active_amount_to_pay)} hint="Неоплаченный остаток по заказам" />
        </div>
      ) : (
        <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-panel rounded-2xl p-5">
              <div className="h-3 w-24 rounded-full bg-surface-2" />
              <div className="mt-4 h-8 w-28 rounded-full bg-surface-2" />
              <div className="mt-3 h-2 w-40 rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      )}

      <section className="surface-toolbar space-y-3 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center" data-testid="orders-toolbar-primary-row">
          <div className="min-w-0 w-full lg:flex-1" data-testid="orders-toolbar-search">
            <div className="relative overflow-hidden rounded-lg border border-border/70 bg-gradient-to-b from-surface-2 to-surface p-0.5">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
              <div className="relative flex items-center gap-2 rounded-md border border-border bg-background/40 px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                  <AppInput
                    value={search}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSearch(next);
                      updateParam("q", next.trim() ? next : undefined, { resetScroll: true });
                    }}
                  placeholder="Поиск по клиенту, телефону, номеру, VIN, марке или модели"
                  className="h-11 border-0 bg-transparent px-0 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:ring-0 sm:text-[13px]"
                />
              </div>
            </div>
          </div>
          <AppButton
            variant={activeAdditionalFilterCount || hasCustomSorting ? "subtle" : "outline"}
            className="w-full justify-between lg:w-auto lg:shrink-0"
            onClick={() => setIsFilterPanelOpen(true)}
          >
            <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Фильтры и сортировка</span>
            {activeAdditionalFilterCount ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{activeAdditionalFilterCount}</span>
            ) : hasCustomSorting ? (
              <span className="h-2 w-2 rounded-full bg-accent" aria-label="Применена пользовательская сортировка" />
            ) : null}
          </AppButton>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={archivedParam === "all"} label="Все" count={archiveCounts.all} onClick={() => setArchiveFilter("all")} />
            <FilterChip active={archivedParam === "active"} label="Активные" count={archiveCounts.active} onClick={() => setArchiveFilter("active")} />
            <FilterChip active={archivedParam === "archived"} label="Архив" count={archiveCounts.archived} onClick={() => setArchiveFilter("archived")} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {visibleStatusFilters.map((item) => (
              <FilterChip
                key={item.value}
                active={statusFilters.includes(item.value)}
                label={item.label}
                count={statusCounts[item.value] ?? 0}
                onClick={() => toggleStatusFilter(item.value)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="min-w-0">
        <section className="min-w-0">
          {ordersQuery.isLoading ? <OrdersListSkeleton /> : null}

          {ordersQuery.isError && !ordersQuery.data ? (
            <ErrorState
              title="Не удалось загрузить заказы"
              description="Проверьте подключение и попробуйте снова."
              actionLabel="Повторить"
              onAction={() => void ordersQuery.refetch()}
            />
          ) : null}

          {!ordersQuery.isLoading && ordersQuery.data ? (
            orders.length ? (
              <>
                {ordersQuery.isError ? (
                  <div className="mb-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                    Последние данные показаны из кэша. Не удалось обновить список.
                  </div>
                ) : null}
                <OrdersList
                  isMobile={isMobile}
                  onOpenOrder={handleOpenOrder}
                  onPrefetchOrder={handlePrefetchOrder}
                  onToggleSort={handleToggleSort}
                  orders={orders}
                  selectedOrderId={selectedOrderKey && selectedOrderKey !== "new" ? Number(selectedOrderKey) : null}
                  sortDescriptors={sortDescriptors}
                  viewMode={ordersViewMode}
                />
                <InfiniteScrollFooter
                  className="mt-4"
                  hasNextPage={ordersQuery.hasNextPage ?? false}
                  isFetchNextPageError={ordersQuery.isFetchNextPageError}
                  isFetchingNextPage={ordersQuery.isFetchingNextPage}
                  loadedCount={ordersQuery.loadedCount}
                  onLoadMore={() => void ordersQuery.fetchNextPage()}
                  onRetry={() => void ordersQuery.fetchNextPage()}
                  total={ordersQuery.total}
                />
              </>
            ) : (
              <EmptyState
                title="Заказы не найдены"
                description="Измените фильтры или создайте новый заказ."
                action={canCreateOrder ? <AppButton onClick={handleCreateOrder}>Создать заказ</AppButton> : null}
              />
            )
          ) : null}
        </section>

        {selectedOrderKey ? (
          <OrderDetailPanel
            desktopMode={isMobile || orderDetailVersion === "legacy" ? "overlay" : "docked"}
            isMobile={isMobile}
            onClose={handleCloseOrder}
            onCreated={handleOpenOrder}
            orderKey={selectedOrderKey}
            variant={orderDetailVersion}
          />
        ) : null}
      </div>

      {canCreateOrder ? (
        <button
          type="button"
          onClick={handleCreateOrder}
          aria-label="Новый заказ"
          className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-soft transition-all duration-200 active:bg-accent-hover lg:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : null}

      {isFilterPanelOpen ? (
        <OrdersFilterSortPanel
          filters={additionalFilters}
          isSavingDefault={updatePreferencesMutation.isPending}
          onApply={handleApplyFiltersAndSorting}
          onClose={() => setIsFilterPanelOpen(false)}
          onSaveDefault={(descriptors) => updatePreferencesMutation.mutate({ order_sorting: descriptors })}
          saveDefaultError={updatePreferencesMutation.isError ? "Не удалось сохранить сортировку по умолчанию." : null}
          sortDescriptors={sortDescriptors}
        />
      ) : null}
    </PageContainer>
  );
}

function isSameSorting(left: OrderSortDescriptor[], right: OrderSortDescriptor[]) {
  return left.length === right.length && left.every((item, index) => item.key === right[index]?.key && item.direction === right[index]?.direction);
}

function FilterChip({
  active,
  count,
  label,
  onClick
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-w-[118px] items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-all duration-200",
        active
          ? "border-accent/80 bg-accent-muted text-foreground shadow-sm"
          : "border-border/60 bg-surface-2/60 text-foreground hover:border-border hover:bg-surface-2"
      )}
    >
      <span className="text-[13px] font-medium tracking-tight">{label}</span>
      <span className={cn("text-[13px] font-medium", active ? "text-foreground" : "text-muted-foreground")}>{formatNumber(count)}</span>
    </button>
  );
}
