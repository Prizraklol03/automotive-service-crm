import { useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, CalendarClock, CheckCircle2, Plus, Search } from "lucide-react";

import {
  getNotificationsScopeDescription,
  getNotificationsScopeLabel
} from "@/entities/notification/model/presentation";
import type { NotificationItem, NotificationsScope } from "@/entities/notification/model/types";
import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { useNotificationsListQuery, useNotificationsSummaryQuery } from "@/features/notifications/api/notifications-hooks";
import { NotificationDetailPanel } from "@/features/notifications/ui/notification-detail-panel";
import { NotificationsList } from "@/features/notifications/ui/notifications-list";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { StatCard } from "@/shared/ui/stat-card";

function normalizeScope(value: string | null): NotificationsScope {
  if (value === "scheduled" || value === "history" || value === "all") return value;
  return "due";
}

function normalizeSearchValue(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchesNotificationSearch(notification: NotificationItem, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [notification.id, notification.reminder_id, notification.text, notification.target_summary.title, notification.target_summary.subtitle];
  return haystack.some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function NotificationsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const deferredSearch = useDeferredValue(search);
  const scope = normalizeScope(searchParams.get("scope"));
  const reminderKey = searchParams.get("reminder");
  const selectedReminderId = reminderKey && reminderKey !== "new" ? Number(reminderKey) : null;
  const viewOrderKey = searchParams.get("viewOrder");
  const viewClientKey = searchParams.get("viewClient");
  const viewVehicleKey = searchParams.get("viewVehicle");

  const notificationsQuery = useNotificationsListQuery(scope);
  const notificationsSummaryQuery = useNotificationsSummaryQuery();
  const normalizedSearch = deferredSearch.trim();
  const notifications = useMemo(
    () => (notificationsQuery.data ?? []).filter((notification) => matchesNotificationSearch(notification, normalizedSearch)),
    [normalizedSearch, notificationsQuery.data]
  );

  const stats = notificationsSummaryQuery.data;
  const summaryValue = (value: number) => (notificationsSummaryQuery.data ? formatNumber(value) : notificationsSummaryQuery.isError ? "—" : "…");

  const updateParam = (key: string, value?: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    if (key !== "reminder") {
      next.delete("reminder");
    }
    setSearchParams(next, { replace: true });
  };

  const updateParams = (updates: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const openOrderPanel = (orderId: number) => updateParams({ viewOrder: String(orderId), viewClient: null, viewVehicle: null });
  const closeOrderPanel = () => updateParams({ viewOrder: null });
  const openClientPanel = (clientId: number | string) => updateParams({ viewClient: String(clientId), viewOrder: null, viewVehicle: null });
  const closeClientPanel = () => updateParams({ viewClient: null, viewVehicle: null });
  const openVehiclePanel = (vehicleId: number | string) => updateParams({ viewVehicle: String(vehicleId), viewOrder: null });
  const closeVehiclePanel = () => updateParams({ viewVehicle: null });
  const handleOpenTarget = (targetType: "client" | "vehicle" | "order", targetId: number) => {
    if (targetType === "client") openClientPanel(targetId);
    else if (targetType === "vehicle") openVehiclePanel(targetId);
    else openOrderPanel(targetId);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Напоминания"
        description="Единый менеджер напоминаний по заказам, клиентам, автомобилям и личным задачам."
        actions={
          <>
            <AppButton onClick={() => updateParam("reminder", "new")}>
              <Plus className="h-4 w-4" />
              Новое напоминание
            </AppButton>
          </>
        }
      />

      <div className="hidden gap-4 md:grid-cols-3 lg:grid">
        <StatCard
          label="К исполнению"
          value={summaryValue(stats?.due ?? 0)}
          hint="Нужно сделать сейчас"
          trend={<Bell className="h-4 w-4" />}
        />
        <StatCard
          label="Запланированные"
          value={summaryValue(stats?.scheduled ?? 0)}
          hint="Запланировано на будущее"
          trend={<CalendarClock className="h-4 w-4" />}
        />
        <StatCard
          label="История"
          value={summaryValue(stats?.history ?? 0)}
          hint="Выполнено или удалено"
          trend={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">{getNotificationsScopeLabel(scope)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{getNotificationsScopeDescription(scope)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["due", "scheduled", "history", "all"] as NotificationsScope[]).map((item) => (
              <AppButton
                key={item}
                variant={scope === item ? "default" : "outline"}
                onClick={() => updateParam("scope", item === "due" ? null : item)}
              >
                {getNotificationsScopeLabel(item)}
              </AppButton>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-4 max-w-[520px]">
          <div className="relative overflow-hidden rounded-lg border border-border/70 bg-gradient-to-b from-surface-2 to-surface p-0.5 shadow-soft">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="relative flex items-center gap-2 rounded-md border border-border bg-background/40 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <AppInput
                value={search}
                onChange={(event) => {
                  const next = event.target.value;
                  setSearch(next);
                  updateParam("q", next.trim() ? next : null);
                }}
                placeholder="Поиск по тексту, клиенту, автомобилю или заказу"
                className="h-11 border-0 bg-transparent px-0 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:ring-0 sm:text-[13px]"
              />
            </div>
          </div>
        </div>

        {notificationsQuery.isLoading ? (
          <LoadingState title="Загружаем напоминания" description="Подготавливаем список напоминаний." />
        ) : null}

        {notificationsQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить напоминания"
            description="Проверьте соединение и попробуйте снова."
            actionLabel="Повторить"
            onAction={() => void notificationsQuery.refetch()}
          />
        ) : null}

        {!notificationsQuery.isLoading && !notificationsQuery.isError ? (
          <NotificationsList
            isMobile={isMobile}
            notifications={notifications}
            onOpenReminder={(value) => updateParam("reminder", String(value))}
            scope={scope}
            selectedReminderId={selectedReminderId}
          />
        ) : null}
      </section>

      {reminderKey ? (
        <NotificationDetailPanel
          isMobile={isMobile}
          onClose={() => updateParam("reminder", null)}
          onOpenTarget={handleOpenTarget}
          reminderKey={reminderKey}
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
