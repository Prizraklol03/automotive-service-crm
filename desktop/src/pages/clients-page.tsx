import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Users } from "lucide-react";
import { useCan } from "@/features/auth/model/permissions";

import { useClientsInfiniteQuery } from "@/features/clients/api/clients-hooks";
import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { ClientsList } from "@/features/clients/ui/clients-list";
import { useClientsViewMode } from "@/shared/hooks/use-clients-view-mode";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { cn } from "@/shared/lib/cn";
import { formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { InfiniteScrollFooter } from "@/shared/ui/infinite-scroll-footer";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";

const DEFAULT_PAGE_SIZE = 50;

export function ClientsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const { mode: clientsViewMode } = useClientsViewMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const deferredSearch = useDeferredValue(search);
  const searchParamsKey = searchParams.toString();
  const canViewVehicles = useCan("vehicles.view");
  const canCreateClient = useCan("clients.create");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParamsKey]);

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

  const selectedClientKey = searchParams.get("client");
  const selectedVehicleKey = searchParams.get("vehicle");
  const selectedOrderKey = searchParams.get("order");
  const selectedClientId = selectedClientKey && selectedClientKey !== "new" ? Number(selectedClientKey) : null;
  const normalizedSearch = deferredSearch.trim();

  const clientsQuery = useClientsInfiniteQuery({
    pageSize: DEFAULT_PAGE_SIZE,
    search: normalizedSearch
  });

  const clients = clientsQuery.items;
  const clientsTotalLabel = useMemo(() => {
    if (!clientsQuery.data) {
      return "Готовим список клиентов";
    }
    return `${formatNumber(clientsQuery.total)} клиентов`;
  }, [clientsQuery.data, clientsQuery.total]);

  const updateParam = (key: string, value?: string | null, options: { resetScroll?: boolean } = {}) => {
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

    if (key !== "client" && key !== "vehicle") {
      next.delete("client");
      next.delete("vehicle");
    }

    setSearchParams(next, { replace: true });
  };

  const handleOpenClient = (clientId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("client", String(clientId));
    next.delete("vehicle");
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const handleCloseClient = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("client");
    next.delete("vehicle");
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const handleCreateClient = () => {
    const next = new URLSearchParams(searchParams);
    next.set("client", "new");
    next.delete("vehicle");
    setSearchParams(next, { replace: true });
  };

  const handleOpenVehicle = (vehicleKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("vehicle", vehicleKey);
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const handleCloseVehicle = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("vehicle");
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const handleOpenOrder = (orderKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("order", orderKey);
    setSearchParams(next, { replace: true });
  };

  const handleCloseOrder = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Клиенты"
        description={clientsTotalLabel}
        actions={
          <>
            {canViewVehicles ? (
              <AppButton asChild variant="outline">
                <Link to="/vehicles">Перейти к авто</Link>
              </AppButton>
            ) : null}
            {canCreateClient ? (
              <AppButton onClick={handleCreateClient}>
                <Plus className="h-4 w-4" />
                Новый клиент
              </AppButton>
            ) : null}
          </>
        }
      />

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative overflow-hidden rounded-lg border border-border/70 bg-gradient-to-b from-surface-2 to-surface p-0.5 shadow-soft">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="relative flex items-center gap-2 rounded-md border border-border bg-background/40 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
                <AppInput
                  value={search}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSearch(next);
                    updateParam("q", next.trim() ? next : null, { resetScroll: true });
                  }}
                placeholder="Поиск по имени, телефону или Telegram"
                className="h-11 border-0 bg-transparent px-0 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:ring-0 sm:text-[13px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground lg:min-w-[180px] lg:justify-center">
            <Users className="h-4 w-4" />
            {clientsTotalLabel}
          </div>
        </div>
      </section>

      <div className="min-w-0 space-y-4">
        <section className="min-w-0">
          {clientsQuery.isLoading && !clientsQuery.data ? <LoadingState title="Загружаем клиентов" description="Получаем список клиентов CRM." /> : null}

          {clientsQuery.isError && !clientsQuery.data ? (
            <ErrorState
              title="Не удалось загрузить клиентов"
              description="Проверьте подключение и попробуйте снова."
              actionLabel="Повторить"
              onAction={() => void clientsQuery.refetch()}
            />
          ) : null}

          {!clientsQuery.isLoading && clientsQuery.data ? (
            clients.length ? (
              <>
                {clientsQuery.isError ? (
                  <div className="mb-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                    Последние данные показаны из кэша. Не удалось обновить список клиентов.
                  </div>
                ) : null}
                <ClientsList
                  clients={clients}
                  isMobile={isMobile}
                  onOpenClient={handleOpenClient}
                  selectedClientId={selectedClientId}
                  viewMode={clientsViewMode}
                />
                <InfiniteScrollFooter
                  className="mt-4"
                  hasNextPage={clientsQuery.hasNextPage ?? false}
                  isFetchNextPageError={clientsQuery.isFetchNextPageError}
                  isFetchingNextPage={clientsQuery.isFetchingNextPage}
                  loadedCount={clientsQuery.loadedCount}
                  onLoadMore={() => void clientsQuery.fetchNextPage()}
                  onRetry={() => void clientsQuery.fetchNextPage()}
                  total={clientsQuery.total}
                />
              </>
            ) : (
              <EmptyState
                title="Клиенты не найдены"
                description="Измените поиск или создайте нового клиента."
                action={canCreateClient ? <AppButton onClick={handleCreateClient}>Создать клиента</AppButton> : null}
              />
            )
          ) : null}
        </section>

        {selectedClientKey ? (
          <ClientDetailPanel
            clientKey={selectedClientKey}
            desktopMode={isMobile ? "overlay" : "docked"}
            isMobile={isMobile}
            onClose={handleCloseClient}
            onCreated={(clientId) => handleOpenClient(clientId)}
            onOpenOrder={handleOpenOrder}
            onOpenVehicle={handleOpenVehicle}
            onVehicleClose={handleCloseVehicle}
            onVehicleCreated={(vehicleId) => handleOpenVehicle(String(vehicleId))}
            vehicleKey={selectedVehicleKey}
          />
        ) : null}

        {selectedOrderKey ? (
          <OrderDetailPanel
            desktopMode={isMobile || orderDetailVersion === "legacy" ? "overlay" : "docked"}
            isMobile={isMobile}
            onClose={handleCloseOrder}
            onCreated={(orderId) => handleOpenOrder(String(orderId))}
            orderKey={selectedOrderKey}
          />
        ) : null}
      </div>
    </PageContainer>
  );
}
