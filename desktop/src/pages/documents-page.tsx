import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { DocumentDetailPanel } from "@/features/documents/ui/document-detail-panel";
import { OrderDocumentsSection } from "@/features/documents/ui/order-documents-section";
import { useOrdersListQuery } from "@/features/orders/api/orders-hooks";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelect } from "@/shared/ui/app-select";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { formatNumber } from "@/shared/lib/format";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { SearchInput } from "@/shared/ui/search-input";

export function DocumentsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(() => {
    const orderParam = searchParams.get("order");
    return orderParam ? new Set([Number(orderParam)]) : new Set();
  });

  const archivedParam = searchParams.get("archived") ?? "all";
  const orderParam = searchParams.get("order");
  const documentParam = searchParams.get("document");
  const viewOrderKey = searchParams.get("viewOrder");
  const viewClientKey = searchParams.get("viewClient");
  const viewVehicleKey = searchParams.get("viewVehicle");

  const archivedFilter = archivedParam === "all" ? undefined : archivedParam === "archived";
  const selectedOrderId = orderParam ? Number(orderParam) : null;
  const selectedDocumentId = documentParam ? Number(documentParam) : null;

  const ordersQuery = useOrdersListQuery({
    archived: archivedFilter,
    search
  });

  const orders = ordersQuery.data ?? [];
  useEffect(() => {
    if (!selectedOrderId) {
      return;
    }

    setExpandedOrders((current) => new Set(current).add(selectedOrderId));
    const timeoutId = window.setTimeout(() => {
      document.getElementById(`documents-order-${selectedOrderId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [selectedOrderId, orders.length]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setSearchParams(next, { replace: true });
  };

  const toggleOrder = (orderId: number) => {
    setExpandedOrders((current) => {
      const next = new Set(current);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleOpenDocument = (orderId: number, documentId: number) => {
    setExpandedOrders((current) => new Set(current).add(orderId));
    updateParams({
      document: String(documentId),
      order: String(orderId)
    });
  };

  const openOrderPanel = (orderId: number) => updateParams({ viewOrder: String(orderId), viewClient: null, viewVehicle: null });
  const closeOrderPanel = () => updateParams({ viewOrder: null });
  const openClientPanel = (clientId: number | string) => updateParams({ viewClient: String(clientId), viewOrder: null, viewVehicle: null });
  const closeClientPanel = () => updateParams({ viewClient: null, viewVehicle: null });
  const openVehiclePanel = (vehicleId: number | string) => updateParams({ viewVehicle: String(vehicleId), viewOrder: null });
  const closeVehiclePanel = () => updateParams({ viewVehicle: null });

  return (
    <PageContainer>
      <PageHeader
        title="Документы"
        description="Документы по заказам со скачиванием и печатной формой."
      />

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              value={search}
              onChange={(event) => {
                const next = event.target.value;
                setSearch(next);
                updateParams({ q: next.trim() ? next : null });
              }}
              placeholder="Поиск заказа по клиенту, телефону или номеру авто"
            />
          </div>
          <AppSelect
            className="w-full lg:w-[220px]"
            value={archivedParam}
            onChange={(event) => updateParams({ archived: event.target.value === "all" ? null : event.target.value })}
          >
            <option value="active">Активные</option>
            <option value="archived">Завершенные</option>
            <option value="all">Все</option>
          </AppSelect>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Заказы</h2>
            <p className="text-sm text-muted-foreground">В списке: {formatNumber(orders.length)}</p>
          </div>
        </div>

        {ordersQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-surface" />
            ))}
          </div>
        ) : null}

        {ordersQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить заказы"
            description="Проверьте подключение и попробуйте снова."
            actionLabel="Повторить"
            onAction={() => void ordersQuery.refetch()}
          />
        ) : null}

        {!ordersQuery.isLoading && !ordersQuery.isError ? (
          orders.length ? (
            <div className="space-y-4">
              {orders.map((order) => {
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <article id={`documents-order-${order.id}`} key={order.id} className="rounded-2xl border border-border bg-surface">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2/60 sm:px-5"
                      onClick={() => {
                        toggleOrder(order.id);
                        updateParams({ order: String(order.id), document: null });
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">Заказ #{order.id}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {order.client_full_name} · {order.vehicle_plate_number}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden text-xs text-muted-foreground sm:block">
                          {isExpanded ? "Свернуть документы" : "Показать документы"}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
                      <AppButton
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          openOrderPanel(order.id);
                        }}
                      >
                        Открыть заказ
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          openClientPanel(order.client_id);
                        }}
                      >
                        Клиент
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          openVehiclePanel(order.vehicle_id);
                        }}
                      >
                        Авто
                      </AppButton>
                    </div>

                    {isExpanded ? (
                      <div className="border-t border-border px-4 py-4 sm:px-5">
                        <OrderDocumentsSection
                          mode="full"
                          orderId={order.id}
                          onOpenDocument={(documentId) => handleOpenDocument(order.id, documentId)}
                          selectedDocumentId={selectedOrderId === order.id ? selectedDocumentId : null}
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Заказы не найдены"
              description="Измените поиск или режим завершенных."
            />
          )
        ) : null}
      </section>

      {selectedDocumentId ? (
        <DocumentDetailPanel
          documentId={selectedDocumentId}
          isMobile={isMobile}
          onClose={() => updateParams({ document: null })}
          onOpenClient={openClientPanel}
          onOpenOrder={openOrderPanel}
          onOpenVehicle={openVehiclePanel}
        />
      ) : null}

      {viewOrderKey ? (
        <OrderDetailPanel
          desktopMode={isMobile || orderDetailVersion === "legacy" ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={closeOrderPanel}
          orderKey={viewOrderKey}
        />
      ) : null}

      {viewClientKey ? (
        <ClientDetailPanel
          clientKey={viewClientKey}
          desktopMode={isMobile ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={closeClientPanel}
          onCreated={(clientId) => openClientPanel(clientId)}
          onOpenOrder={(orderKey) => openOrderPanel(Number(orderKey))}
          onOpenVehicle={openVehiclePanel}
          onVehicleClose={closeVehiclePanel}
          onVehicleCreated={(vehicleId) => openVehiclePanel(vehicleId)}
          vehicleKey={viewVehicleKey}
        />
      ) : null}

      {!viewClientKey && viewVehicleKey ? (
        <VehicleDetailPanel
          desktopMode={isMobile ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={closeVehiclePanel}
          onCreated={(vehicleId) => openVehiclePanel(vehicleId)}
          onOpenOrder={(orderKey) => openOrderPanel(Number(orderKey))}
          vehicleKey={viewVehicleKey}
        />
      ) : null}
    </PageContainer>
  );
}
