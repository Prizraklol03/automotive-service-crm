import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CarFront, Plus, Search } from "lucide-react";
import { useCan } from "@/features/auth/model/permissions";

import { useVehiclesInfiniteQuery } from "@/features/vehicles/api/vehicles-hooks";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { VehiclesList } from "@/features/vehicles/ui/vehicles-list";
import { useVehiclesViewMode } from "@/shared/hooks/use-vehicles-view-mode";
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

export function VehiclesPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const { mode: vehiclesViewMode } = useVehiclesViewMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const deferredSearch = useDeferredValue(search);
  const searchParamsKey = searchParams.toString();
  const canViewClients = useCan("clients.view");
  const canCreateVehicle = useCan("vehicles.create");

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

  const selectedVehicleKey = searchParams.get("vehicle") ?? searchParams.get("car");
  const selectedOrderKey = searchParams.get("order");
  const clientPresetId = searchParams.get("client") ? Number(searchParams.get("client")) : null;
  const selectedVehicleId = selectedVehicleKey && selectedVehicleKey !== "new" ? Number(selectedVehicleKey) : null;
  const normalizedSearch = deferredSearch.trim();

  const vehiclesQuery = useVehiclesInfiniteQuery({
    pageSize: DEFAULT_PAGE_SIZE,
    search: normalizedSearch
  });

  const vehicles = vehiclesQuery.items;
  const vehiclesTotalLabel = useMemo(() => {
    if (!vehiclesQuery.data) {
      return "Готовим список автомобилей";
    }
    return `${formatNumber(vehiclesQuery.total)} авто`;
  }, [vehiclesQuery.data, vehiclesQuery.total]);

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

    if (key !== "vehicle" && key !== "car") {
      next.delete("vehicle");
      next.delete("car");
    }

    setSearchParams(next, { replace: true });
  };

  const handleOpenVehicle = (vehicleId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("vehicle", String(vehicleId));
    next.delete("car");
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const handleCloseVehicle = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("vehicle");
    next.delete("car");
    if (selectedVehicleKey === "new") {
      next.delete("client");
    }
    setSearchParams(next, { replace: true });
  };

  const handleCreateVehicle = () => {
    const next = new URLSearchParams(searchParams);
    next.set("vehicle", "new");
    next.delete("car");
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
        title="Автомобили"
        description={vehiclesTotalLabel}
        actions={
          <>
            {canViewClients ? (
              <AppButton asChild variant="outline">
                <Link to="/clients">Перейти к клиентам</Link>
              </AppButton>
            ) : null}
            {canCreateVehicle ? (
              <AppButton onClick={handleCreateVehicle}>
                <Plus className="h-4 w-4" />
                Новый автомобиль
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
                placeholder="Поиск по госномеру, VIN, марке или модели"
                className="h-11 border-0 bg-transparent px-0 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:ring-0 sm:text-[13px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground lg:min-w-[180px] lg:justify-center">
            <CarFront className="h-4 w-4" />
            {vehiclesTotalLabel}
          </div>
        </div>
      </section>

      <div className="min-w-0 space-y-4">
        <section className="min-w-0">
          {vehiclesQuery.isLoading && !vehiclesQuery.data ? <LoadingState title="Загружаем автомобили" description="Получаем список машин CRM." /> : null}

          {vehiclesQuery.isError && !vehiclesQuery.data ? (
            <ErrorState
              title="Не удалось загрузить автомобили"
              description="Проверьте подключение и попробуйте снова."
              actionLabel="Повторить"
              onAction={() => void vehiclesQuery.refetch()}
            />
          ) : null}

          {!vehiclesQuery.isLoading && vehiclesQuery.data ? (
            vehicles.length ? (
              <>
                {vehiclesQuery.isError ? (
                  <div className="mb-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                    Последние данные показаны из кэша. Не удалось обновить список автомобилей.
                  </div>
                ) : null}
                <VehiclesList
                  isMobile={isMobile}
                  onOpenVehicle={handleOpenVehicle}
                  selectedVehicleId={selectedVehicleId}
                  vehicles={vehicles}
                  viewMode={vehiclesViewMode}
                />
                <InfiniteScrollFooter
                  className="mt-4"
                  hasNextPage={vehiclesQuery.hasNextPage ?? false}
                  isFetchNextPageError={vehiclesQuery.isFetchNextPageError}
                  isFetchingNextPage={vehiclesQuery.isFetchingNextPage}
                  loadedCount={vehiclesQuery.loadedCount}
                  onLoadMore={() => void vehiclesQuery.fetchNextPage()}
                  onRetry={() => void vehiclesQuery.fetchNextPage()}
                  total={vehiclesQuery.total}
                />
              </>
            ) : (
              <EmptyState
                title="Автомобили не найдены"
                description="Измените поиск или создайте новый автомобиль."
                action={canCreateVehicle ? <AppButton onClick={handleCreateVehicle}>Создать автомобиль</AppButton> : null}
              />
            )
          ) : null}
        </section>

        {selectedVehicleKey ? (
          <VehicleDetailPanel
            clientPresetId={clientPresetId}
            desktopMode={isMobile ? "overlay" : "docked"}
            isMobile={isMobile}
            onClose={handleCloseVehicle}
            onCreated={handleOpenVehicle}
            onOpenOrder={handleOpenOrder}
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
