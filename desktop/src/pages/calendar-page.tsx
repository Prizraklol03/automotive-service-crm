import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useColorPalette } from "@/shared/hooks/use-color-palette";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Phone,
  Plus
} from "lucide-react";

import type { OrderSummary } from "@/entities/order/model/types";
import {
  getReminderRepeatLabel,
  getReminderStatusLabel,
  getReminderStatusTone
} from "@/entities/notification/model/presentation";
import type { NotificationItem } from "@/entities/notification/model/types";
import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { useNotificationsListQuery } from "@/features/notifications/api/notifications-hooks";
import { NotificationDetailPanel } from "@/features/notifications/ui/notification-detail-panel";
import {
  useOrderDetailQuery,
  useOrdersListQuery,
  useUpdateOrderMutation
} from "@/features/orders/api/orders-hooks";
import { getUniqueOrderAccentColors } from "@/features/orders/model/order-category-colors";
import { mapFormValuesToOrderPayload, mapOrderToFormValues } from "@/features/orders/model/order-form";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";
import { useServiceCategoriesQuery } from "@/features/services/api/services-hooks";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { cn } from "@/shared/lib/cn";
import { getDefaultDateTimeValue, toCrmDate, toLocalDateTimeInputValue } from "@/shared/lib/datetime";
import { formatCurrency, formatDateTime } from "@/shared/lib/format";
import { normalizePhoneNumber } from "@/shared/lib/phone";
import { AppButton } from "@/shared/ui/app-button";
import { AppSwitch } from "@/shared/ui/app-switch";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { SearchInput } from "@/shared/ui/search-input";
import { StatusBadge } from "@/shared/ui/status-badge";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const FALLBACK_ORDER_COLOR = "#4DA3FF";
const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

const NON_ALPHANUMERIC_RE = /[^A-Za-z0-9]/g;

function normalizePlateSearchQuery(value: string) {
  return value.trim().toUpperCase().replace(NON_ALPHANUMERIC_RE, "");
}

function normalizeVinSearchQuery(value: string) {
  return value.trim().toUpperCase().replace(NON_ALPHANUMERIC_RE, "");
}

function matchesCalendarSearch(order: OrderSummary, searchQuery: string) {
  const normalizedQuery = searchQuery.trim();
  if (!normalizedQuery) {
    return true;
  }

  const nameQuery = normalizedQuery.toLocaleLowerCase("ru-RU");
  const normalizedPhoneQuery = (normalizePhoneNumber(normalizedQuery) ?? normalizedQuery.replace(/\D/g, "")).replace(/^\+/, "");
  const normalizedPlateQuery = normalizePlateSearchQuery(normalizedQuery);
  const normalizedVinQuery = normalizeVinSearchQuery(normalizedQuery);

  const normalizedClientName = order.client_full_name.toLocaleLowerCase("ru-RU");
  const normalizedClientPhone = (normalizePhoneNumber(order.client_phone) ?? order.client_phone).replace(/\D/g, "");
  const normalizedPlate = normalizePlateSearchQuery(order.vehicle_plate_number);
  const normalizedVin = normalizeVinSearchQuery(order.vehicle_vin ?? "");

  return (
    normalizedClientName.includes(nameQuery) ||
    (normalizedPhoneQuery.length > 0 && normalizedClientPhone.includes(normalizedPhoneQuery)) ||
    (normalizedPlateQuery.length > 0 && normalizedPlate.includes(normalizedPlateQuery)) ||
    (normalizedVinQuery.length > 0 && normalizedVin.includes(normalizedVinQuery))
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatMonthLabel(date: Date) {
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric"
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatYearLabel(date: Date) {
  return String(date.getFullYear());
}

function formatDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatShortDay(value: string | null | undefined) {
  if (!value) {
    return "Не задано";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}`;
}

function formatSelectedDateTitle(value: string) {
  const [yearText = "", monthText = "", dayText = ""] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) ? month : 1;
  const safeDay = Number.isFinite(day) ? day : 1;
  const date = new Date(safeYear, safeMonth - 1, safeDay);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long"
  }).format(date);
}

function getDayKeyFromDateTime(value: string) {
  const date = toCrmDate(value);
  if (!date) {
    return value.slice(0, 10);
  }

  return formatDayKey(date);
}

function getCalendarStart(date: Date) {
  const firstDay = startOfMonth(date);
  const weekday = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - weekday);
  return start;
}

function buildCalendarDays(month: Date) {
  const start = getCalendarStart(month);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function compareOrders(left: OrderSummary, right: OrderSummary) {
  const leftDate = left.scheduled_for ?? left.due_date ?? "";
  const rightDate = right.scheduled_for ?? right.due_date ?? "";
  return leftDate.localeCompare(rightDate) || left.id - right.id;
}

function compareNotifications(left: NotificationItem, right: NotificationItem) {
  return left.due_at.localeCompare(right.due_at) || left.id - right.id;
}

function groupByDate<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const map = new Map<string, T[]>();

  items.forEach((item) => {
    const key = getKey(item);
    if (!key) {
      return;
    }

    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  });

  return map;
}

function getOrderColor(order: OrderSummary) {
  return order.primary_category_color ?? FALLBACK_ORDER_COLOR;
}

function getOrderAccentColors(order: OrderSummary) {
  const seen = new Set<string>();
  const colors = order.category_colors.reduce<string[]>((result, color) => {
    const normalizedColor = color.trim().toLowerCase();
    if (!normalizedColor || seen.has(normalizedColor)) {
      return result;
    }

    seen.add(normalizedColor);
    result.push(color);
    return result;
  }, []);

  if (colors.length > 0) {
    return colors;
  }

  return [getOrderColor(order)];
}

function getOrderAccentBackground(order: OrderSummary) {
  const colors = getOrderAccentColors(order);
  if (colors.length === 1) {
    return colors[0];
  }

  const segmentSize = 100 / colors.length;
  const stops = colors.flatMap((color, index) => {
    const start = Number((index * segmentSize).toFixed(2));
    const end = Number(((index + 1) * segmentSize).toFixed(2));
    return [`${color} ${start}%`, `${color} ${end}%`];
  });

  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

function getUniqueOrderColors(orders: OrderSummary[]) {
  return getUniqueOrderAccentColors(orders);
}

type CalendarOrderGroups = {
  scheduled: OrderSummary[];
  due: OrderSummary[];
};

function groupSelectedOrders(
  dateKey: string,
  scheduledOrdersByDate: Map<string, OrderSummary[]>,
  dueOrdersByDate: Map<string, OrderSummary[]>
): CalendarOrderGroups {
  const due = (dueOrdersByDate.get(dateKey) ?? []).slice().sort(compareOrders);
  const dueOrderIds = new Set(due.map((order) => order.id));
  const scheduled = (scheduledOrdersByDate.get(dateKey) ?? [])
    .filter((order) => !dueOrderIds.has(order.id))
    .slice()
    .sort(compareOrders);

  return { due, scheduled };
}

function collectAvailableDateKeys(
  scheduledOrdersByDate: Map<string, OrderSummary[]>,
  dueOrdersByDate: Map<string, OrderSummary[]>
) {
  const keys = new Set<string>();

  scheduledOrdersByDate.forEach((orders, key) => {
    if (orders.length) {
      keys.add(key);
    }
  });
  dueOrdersByDate.forEach((orders, key) => {
    if (orders.length) {
      keys.add(key);
    }
  });

  return Array.from(keys).sort();
}

export function CalendarPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { enabled: showCategoryColors, setEnabled: setShowCategoryColors } = useColorPalette();
  const todayKey = formatDayKey(new Date());
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [openPicker, setOpenPicker] = useState<"month" | "year" | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const normalizedSearch = search.trim();
  const { version: orderDetailVersion } = useOrderDetailVersion();
  const orderKey = searchParams.get("order");
  const clientKey = searchParams.get("client");
  const vehicleKey = searchParams.get("vehicle") ?? searchParams.get("car");
  const reminderKey = searchParams.get("reminder");
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const ordersQuery = useOrdersListQuery({
    archived: undefined,
    search: ""
  });
  const notificationsQuery = useNotificationsListQuery("all");
  const categoriesQuery = useServiceCategoriesQuery();

  const orders = useMemo(
    () => ((ordersQuery.data ?? []).filter((order) => matchesCalendarSearch(order, normalizedSearch))).slice().sort(compareOrders),
    [normalizedSearch, ordersQuery.data]
  );
  const reminders = useMemo(
    () => (notificationsQuery.data ?? []).slice().sort(compareNotifications),
    [notificationsQuery.data]
  );

  const scheduledOrdersByDate = useMemo(
    () => groupByDate(orders.filter((order) => Boolean(order.scheduled_for)), (order) => getDayKeyFromDateTime(order.scheduled_for ?? "")),
    [orders]
  );
  const dueOrdersByDate = useMemo(
    () => groupByDate(orders.filter((order) => Boolean(order.due_date)), (order) => getDayKeyFromDateTime(order.due_date ?? "")),
    [orders]
  );
  const remindersByDate = useMemo(
    () => groupByDate(reminders, (reminder) => getDayKeyFromDateTime(reminder.due_at)),
    [reminders]
  );

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const selectedOrderGroups = useMemo(
    () => groupSelectedOrders(selectedDate, scheduledOrdersByDate, dueOrdersByDate),
    [dueOrdersByDate, scheduledOrdersByDate, selectedDate]
  );
  const selectedOrdersCount = selectedOrderGroups.scheduled.length + selectedOrderGroups.due.length;
  const availableDateKeys = useMemo(
    () => collectAvailableDateKeys(scheduledOrdersByDate, dueOrdersByDate),
    [dueOrdersByDate, scheduledOrdersByDate]
  );
  const selectedReminders = normalizedSearch ? [] : remindersByDate.get(selectedDate) ?? [];
  const searchResultLabel = useMemo(() => {
    const ordersCount = orders.length;
    const datesCount = availableDateKeys.length;
    if (!normalizedSearch) {
      return null;
    }
    return `${ordersCount} ${ordersCount === 1 ? "запись" : ordersCount < 5 ? "записи" : "записей"} на ${datesCount} ${datesCount === 1 ? "дату" : datesCount < 5 ? "даты" : "дат"}`;
  }, [availableDateKeys.length, normalizedSearch, orders.length]);

  const isInitialLoading =
    ((!ordersQuery.data && ordersQuery.isFetching) ||
      (!notificationsQuery.data && notificationsQuery.isFetching) ||
      (!categoriesQuery.data && categoriesQuery.isFetching));
  const isRefreshing = ordersQuery.isFetching || notificationsQuery.isFetching || categoriesQuery.isFetching;
  const isError = ordersQuery.isError || notificationsQuery.isError || categoriesQuery.isError;

  const updateReminderParam = (value?: string | null) => {
    const next = new URLSearchParams(searchParams);

    if (!value) {
      next.delete("reminder");
    } else {
      next.set("reminder", value);
    }

    setSearchParams(next, { replace: true });
  };

  const updateParams = (updates: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    setSearchParams(next, { replace: true });
  };

  const handleOpenOrder = (orderId: number) => {
    updateParams({ client: null, order: String(orderId) });
  };

  const handleCloseOrder = () => {
    updateParams({ order: null });
  };

  const handleOpenClient = (clientId: number) => {
    updateParams({ order: null, client: String(clientId), vehicle: null, car: null });
  };

  const handleCloseClient = () => {
    updateParams({ client: null, vehicle: null, car: null });
  };

  const handleOpenVehicle = (vehicleId: string) => {
    updateParams({ order: null, vehicle: vehicleId, car: null });
  };

  const handleCloseVehicle = () => {
    updateParams({ vehicle: null, car: null, order: null });
  };

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!normalizedSearch || !availableDateKeys.length || availableDateKeys.includes(selectedDate)) {
      return;
    }

    const nextDate = availableDateKeys[0];
    if (!nextDate) {
      return;
    }

    setSelectedDate(nextDate);
    const [year, month] = nextDate.split("-").map(Number);
    if (year && month) {
      setCurrentMonth(new Date(year, month - 1, 1));
    }
  }, [availableDateKeys, normalizedSearch, selectedDate]);

  const handleRefresh = () => {
    void ordersQuery.refetch();
    void notificationsQuery.refetch();
    void categoriesQuery.refetch();
  };

  useEffect(() => {
    if (!openPicker) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpenPicker(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openPicker]);

  return (
    <PageContainer>
      <PageHeader
        title="Календарь"
        description="Отслеживайте запись заказов, сроки выполнения и напоминания в одном календаре."
        actions={
          <>
            <AppButton onClick={() => updateReminderParam("new")}>
              <Plus className="h-4 w-4" />
              Новое напоминание
            </AppButton>
          </>
        }
      />

      {isInitialLoading ? (
        <LoadingState
          title="Загружаем календарь"
          description="Собираем заказы, категории и напоминания по датам."
        />
      ) : null}

      {isError ? (
        <ErrorState
          title="Не удалось загрузить календарь"
          description="Проверьте соединение и попробуйте снова."
          actionLabel="Повторить"
          onAction={handleRefresh}
        />
      ) : null}

      {!isInitialLoading && !isError ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_360px] xl:gap-5">
          <div className="space-y-3 sm:space-y-4">
            <section className="glass-panel rounded-2xl p-4 sm:p-5">
              <label htmlFor="calendar-color-palette-switch" className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Цветовая палитра категорий</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Отображает цвета категорий услуг на карточках заказов и в календаре.
                  </p>
                </div>
                <AppSwitch id="calendar-color-palette-switch" checked={showCategoryColors} onChange={setShowCategoryColors} />
              </label>
            </section>
            <div className={cn("surface-toolbar rounded-lg font-medium text-muted-foreground", isMobile ? "px-3 py-3 text-[12px]" : "flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 text-sm sm:px-5 sm:text-[15px]")}>
              <div className={cn(isMobile ? "flex flex-wrap items-center gap-x-3 gap-y-2" : "contents")}>
              {showCategoryColors ? (
                <>
                  <span className={cn("font-semibold text-foreground/90", isMobile ? "w-full text-[12px]" : "text-sm sm:text-[15px]")}>Категории:</span>
                  {(categoriesQuery.data ?? []).map((category) => (
                    <span key={category.id} className={cn("inline-flex items-center", isMobile ? "gap-1.5" : "gap-2.5")}>
                      <span
                        className={cn("rounded-full border border-white/10", isMobile ? "h-2 w-4" : "h-2.5 w-5")}
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </span>
                  ))}
                  <span className={cn("w-px bg-border/70", isMobile ? "hidden" : "h-5")} aria-hidden="true" />
                </>
              ) : null}
              <span className={cn("inline-flex items-center", isMobile ? "gap-2" : "gap-2.5")}>
                <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
                Выполнить до
              </span>
              <span className={cn("inline-flex items-center", isMobile ? "gap-2" : "gap-2.5")}>
                <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                Напоминания
              </span>
              </div>
            </div>

            <section className="surface-toolbar rounded-lg p-3 sm:rounded-lg sm:p-4">
              <div className={cn("grid gap-3", isMobile ? "" : "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center")}>
                <SearchInput
                  value={search}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSearch(next);
                    updateParams({ q: next.trim() ? next : null });
                  }}
                  placeholder="Поиск по ФИО, телефону, госномеру или VIN"
                />
                <div className={cn("flex items-center gap-2 text-sm", isMobile ? "justify-between" : "justify-end")}>
                  {ordersQuery.isFetching ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Обновляем
                    </span>
                  ) : null}
                  {searchResultLabel ? <span className="text-muted-foreground">{searchResultLabel}</span> : null}
                  {normalizedSearch ? (
                    <AppButton
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        updateParams({ q: null });
                      }}
                    >
                      Сбросить
                    </AppButton>
                  ) : null}
                </div>
              </div>
              {normalizedSearch ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Показаны только найденные записи. Календарь остаётся в контексте дат.
                </p>
              ) : null}
            </section>

            <section className="glass-panel overflow-hidden rounded-lg p-3 sm:rounded-lg sm:p-5">
                <div className={cn("flex gap-3", isMobile ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
                  <div ref={pickerRef} className={cn("relative flex flex-wrap items-center gap-2", isMobile && "justify-between")}>
                    <button
                      type="button"
                      onClick={() => setOpenPicker((value) => (value === "month" ? null : "month"))}
                      className={cn("rounded-2xl px-1 py-1 font-semibold leading-none text-foreground transition hover:text-accent", isMobile ? "text-[1rem]" : "text-[1.55rem] sm:text-[1.9rem]")}
                    >
                      {MONTH_LABELS[currentMonth.getMonth()]}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPicker((value) => (value === "year" ? null : "year"))}
                      className={cn("rounded-2xl px-1 py-1 font-semibold leading-none text-foreground transition hover:text-accent", isMobile ? "text-[1rem]" : "text-[1.55rem] sm:text-[1.9rem]")}
                    >
                      {formatYearLabel(currentMonth)} г.
                    </button>

                    {openPicker === "month" ? (
                      <div className={cn("absolute left-0 right-0 top-full z-20 mt-2 grid gap-1 rounded-2xl border border-border/80 bg-background/95 p-2 shadow-panel backdrop-blur", isMobile ? "grid-cols-2" : "w-56 grid-cols-2")}>
                        {MONTH_LABELS.map((monthLabel, monthIndex) => (
                          <button
                            key={monthLabel}
                            type="button"
                            onClick={() => {
                              setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex, 1));
                              setOpenPicker(null);
                            }}
                            className={cn(
                              "rounded-xl px-3 py-2 text-left text-sm transition hover:bg-background/70",
                              monthIndex === currentMonth.getMonth() && "bg-accent/15 text-accent"
                            )}
                          >
                            {monthLabel}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {openPicker === "year" ? (
                      <div className={cn("absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-border/80 bg-background/95 p-2 shadow-panel backdrop-blur", isMobile ? "" : "w-36")}>
                        {Array.from({ length: 15 }, (_, index) => currentMonth.getFullYear() - 7 + index).map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => {
                              setCurrentMonth(new Date(year, currentMonth.getMonth(), 1));
                              setOpenPicker(null);
                            }}
                            className={cn(
                              "block w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-background/70",
                              year === currentMonth.getFullYear() && "bg-accent/15 text-accent"
                            )}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                <div className={cn("flex items-center gap-2", isMobile ? "justify-between" : "justify-center sm:justify-end")}>
                  <AppButton
                    size="icon"
                    type="button"
                    variant="outline"
                    aria-label="Предыдущий месяц"
                    className={cn("rounded-2xl border-border/80 bg-surface-2/70 hover:bg-surface-2", isMobile ? "h-10 w-10" : "h-11 w-11")}
                    onClick={() => setCurrentMonth((value) => addMonths(value, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="outline"
                    className={cn("rounded-2xl border-border/80 bg-surface-2/70 hover:bg-surface-2", isMobile ? "flex-1 px-3" : "px-5")}
                    onClick={() => {
                      setCurrentMonth(startOfMonth(new Date()));
                      setSelectedDate(todayKey);
                    }}
                  >
                    Сегодня
                  </AppButton>
                  <AppButton
                    size="icon"
                    type="button"
                    variant="outline"
                    aria-label="Следующий месяц"
                    className={cn("rounded-2xl border-border/80 bg-surface-2/70 hover:bg-surface-2", isMobile ? "h-10 w-10" : "h-11 w-11")}
                    onClick={() => setCurrentMonth((value) => addMonths(value, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </AppButton>
                </div>
              </div>

              <div className={cn("grid grid-cols-7 text-center font-semibold uppercase tracking-[0.2em] text-muted-foreground/90", isMobile ? "mt-4 gap-1 text-[10px]" : "mt-6 gap-1.5 text-[11px] sm:gap-2.5 sm:text-xs")}>
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className={cn("py-1", isMobile && "py-0.5")}>
                    {label}
                  </div>
                ))}
              </div>

              <div className={cn("grid grid-cols-7", isMobile ? "mt-1.5 gap-1" : "mt-2 gap-1.5 sm:gap-2.5")}>
                {calendarDays.map((day) => {
                  const dayKey = formatDayKey(day);
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isSelected = dayKey === selectedDate;
                  const isToday = dayKey === todayKey;
                  const dueOrders = dueOrdersByDate.get(dayKey) ?? [];
                  const scheduledOrders = scheduledOrdersByDate.get(dayKey) ?? [];
                  const remindersForDay = normalizedSearch ? [] : remindersByDate.get(dayKey) ?? [];
                  const scheduledOrderColors = getUniqueOrderColors(scheduledOrders);
                  const visibleScheduledColors = scheduledOrderColors.slice(0, isMobile ? 3 : 4);
                  const hiddenScheduledCount = Math.max(0, scheduledOrderColors.length - visibleScheduledColors.length);
                  const hasSearchMatch = !normalizedSearch || Boolean(dueOrders.length || scheduledOrders.length);

                  if (!isCurrentMonth) {
                    return (
                      <div
                        key={dayKey}
                        aria-hidden="true"
                        className={cn("aspect-square w-full border border-border/30 bg-transparent opacity-40", isMobile ? "rounded-xl" : "rounded-[1.15rem] lg:min-h-[104px] lg:aspect-auto")}
                      />
                    );
                  }

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => setSelectedDate(dayKey)}
                      className={cn(
                        "relative flex aspect-square w-full flex-col items-center justify-between overflow-hidden border text-center transition-all duration-200", isMobile ? "rounded-xl px-1 py-1.5" : "rounded-[1.15rem] px-2 py-3 sm:rounded-2xl lg:min-h-[104px] lg:aspect-auto lg:px-3",
                        isSelected
                          ? "border-accent bg-gradient-to-b from-accent to-accent-hover text-accent-foreground shadow-soft"
                          : "border-border/70 bg-transparent text-foreground hover:border-accent/40 hover:bg-surface-2/60",
                        isToday && !isSelected && "border-accent/35",
                        normalizedSearch && !hasSearchMatch && "opacity-40"
                      )}
                    >
                      {dueOrders.length ? (
                        <span
                          className={cn(
                            "absolute rounded-full", isMobile ? "left-1 top-1 h-2 w-2" : "left-2 top-2 h-2.5 w-2.5",
                            isSelected ? "bg-[#7AF2A5]" : "bg-[#22C55E]"
                          )}
                        />
                      ) : null}
                      {remindersForDay.length ? (
                        <span
                          className={cn(
                            "absolute rounded-full", isMobile ? "right-1 top-1 h-2 w-2" : "right-2 top-2 h-2.5 w-2.5",
                            isSelected ? "bg-[#FFD38A]" : "bg-[#F59E0B]"
                          )}
                        />
                      ) : null}

                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full font-semibold tabular-nums", isMobile ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm sm:h-10 sm:w-10 lg:text-[15px]",
                          isToday && !isSelected && "bg-accent/12 text-accent",
                          isSelected && "bg-white/10 text-white"
                        )}
                      >
                        {day.getDate()}
                      </span>

                      <span className={cn("flex w-full items-center justify-center", isMobile ? "min-h-2 gap-0.5" : "min-h-3 gap-1.5")}>
                        {showCategoryColors ? visibleScheduledColors.map((color, index) => (
                          <span
                            key={`${dayKey}:${color}:${index}`}
                            className={cn(isMobile ? "h-1 w-3 rounded-full" : "h-1.5 w-5 rounded-full")}
                            style={{ backgroundColor: color }}
                          />
                        )) : scheduledOrders.length > 0 ? (
                          <span className={cn(isMobile ? "h-1 w-3 rounded-full" : "h-1.5 w-5 rounded-full", "bg-muted-foreground/40")} />
                        ) : null}
                        {showCategoryColors && hiddenScheduledCount > 0 ? (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center rounded-full font-semibold tabular-nums",
                              isMobile
                                ? "h-3.5 min-w-3.5 border border-border/60 bg-muted px-1 text-[8px] text-muted-foreground"
                                : "h-4 min-w-4 border border-border/60 bg-muted px-1 text-[10px] text-muted-foreground"
                            )}
                          >
                            +{hiddenScheduledCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

        <section className="glass-panel rounded-lg border border-border/70 bg-gradient-to-b from-surface-2 to-surface p-3 shadow-panel sm:rounded-lg sm:p-4 xl:sticky xl:top-6 xl:h-fit">
            <div className="space-y-2">
              <div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center justify-between")}>
                <div>
                  <h3 className={cn("font-semibold text-foreground", isMobile ? "text-base" : "text-lg xl:text-[1.6rem]")}>
                    {formatSelectedDateTitle(selectedDate)}
                  </h3>
                  <p className="mt-1 text-sm text-accent">
                    {selectedDate === todayKey ? "Сегодня" : formatShortDay(selectedDate)}
                  </p>
                </div>
                <div className={cn("flex flex-wrap gap-2 text-xs", isMobile ? "" : "justify-end")}>
                  {isRefreshing && !isInitialLoading ? (
                    <span className="rounded-full bg-background/20 px-2.5 py-1 text-muted-foreground">
                      Обновляем...
                    </span>
                  ) : null}
                  {selectedOrdersCount ? (
                    <span className="rounded-full bg-[#243F6B] px-2.5 py-1 text-[#7FC3FF]">
                      {selectedOrdersCount} шт.
                    </span>
                  ) : null}
                  {selectedReminders.length ? (
                    <span className="rounded-full bg-[#5C4508] px-2.5 py-1 text-[#F6C343]">
                      {selectedReminders.length} {selectedReminders.length === 1 ? "напоминание" : "напоминания"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
              {!selectedOrdersCount && !selectedReminders.length ? (
                <EmptyState
                  title="На эту дату ничего нет"
                  description="Заказы и напоминания на выбранный день пока не запланированы."
                  icon={<CalendarDays className="h-5 w-5" />}
                  className="rounded-[1.25rem] border border-dashed border-border/80 bg-background/10 p-4 sm:rounded-[1.4rem] sm:p-5"
                />
              ) : null}

              {selectedOrdersCount ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Заказы</h4>
                    <span className="text-xs text-muted-foreground">{selectedOrdersCount}</span>
                  </div>

                  <div className="space-y-3">
                    {selectedOrderGroups.scheduled.length ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Записан</h5>
                          <span className="text-xs text-muted-foreground">{selectedOrderGroups.scheduled.length}</span>
                        </div>
                        {selectedOrderGroups.scheduled.map((order) => (
                          <CalendarOrderCard
                            key={`scheduled:${order.id}`}
                            isMobile={isMobile}
                            onOpenClient={handleOpenClient}
                            onOpenOrder={handleOpenOrder}
                            order={order}
                            showCategoryColors={showCategoryColors}
                          />
                        ))}
                      </div>
                    ) : null}
                    {selectedOrderGroups.due.length ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Завершить</h5>
                          <span className="text-xs text-muted-foreground">{selectedOrderGroups.due.length}</span>
                        </div>
                        {selectedOrderGroups.due.map((order) => (
                          <CalendarOrderCard
                            key={`due:${order.id}`}
                            isMobile={isMobile}
                            onOpenClient={handleOpenClient}
                            onOpenOrder={handleOpenOrder}
                            order={order}
                            showCategoryColors={showCategoryColors}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedReminders.length ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Напоминания</h4>
                    <span className="text-xs text-muted-foreground">{selectedReminders.length}</span>
                  </div>

                  <div className="space-y-3">
                    {selectedReminders.map((reminder) => (
                      <button
                        key={reminder.id}
                        type="button"
                        onClick={() => updateReminderParam(String(reminder.reminder_id))}
                        className={cn("block w-full border border-border/70 bg-background/15 text-left transition hover:border-accent/40 hover:bg-background/25", isMobile ? "rounded-[1.2rem] px-3 py-3" : "rounded-[1.4rem] px-4 py-4")}
                      >
                        <div className={cn("flex gap-3", isMobile ? "flex-col" : "items-start justify-between")}>
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-foreground">{reminder.text}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{reminder.target_summary.title}</p>
                            {reminder.target_summary.subtitle ? (
                              <p className="mt-1 text-xs text-muted-foreground">{reminder.target_summary.subtitle}</p>
                            ) : null}
                          </div>
                          <StatusBadge
                            label={getReminderStatusLabel(reminder.status, reminder)}
                            tone={getReminderStatusTone(reminder.status, undefined, reminder)}
                          />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(reminder.postpone_until ?? reminder.due_at)}</span>
                          <span>{getReminderRepeatLabel(reminder.repeat_rule)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {reminderKey ? (
        <NotificationDetailPanel
          isMobile={isMobile}
          onClose={() => updateReminderParam(null)}
          onOpenTarget={(targetType, targetId) => {
            if (targetType === "client") handleOpenClient(targetId);
            else if (targetType === "vehicle") handleOpenVehicle(String(targetId));
            else handleOpenOrder(targetId);
          }}
          reminderKey={reminderKey}
        />
      ) : null}

      {orderKey ? (
        <OrderDetailPanel
          desktopMode={isMobile || orderDetailVersion === "legacy" ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={handleCloseOrder}
          onCreated={handleOpenOrder}
          orderKey={orderKey}
        />
      ) : null}

      {clientKey ? (
        <ClientDetailPanel
          clientKey={clientKey}
          desktopMode={isMobile ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={handleCloseClient}
          onCreated={handleOpenClient}
          onOpenOrder={(orderId) => handleOpenOrder(Number(orderId))}
          onOpenVehicle={handleOpenVehicle}
          onVehicleClose={handleCloseVehicle}
          onVehicleCreated={(vehicleId) => handleOpenVehicle(String(vehicleId))}
          vehicleKey={vehicleKey}
        />
      ) : null}

      {!clientKey && vehicleKey ? (
        <VehicleDetailPanel
          desktopMode={isMobile ? "overlay" : "docked"}
          isMobile={isMobile}
          onClose={handleCloseVehicle}
          onCreated={(vehicleId) => handleOpenVehicle(String(vehicleId))}
          onOpenOrder={(orderId) => handleOpenOrder(Number(orderId))}
          vehicleKey={vehicleKey}
        />
      ) : null}
    </PageContainer>
  );
}

function CalendarOrderCard({
  order,
  isMobile,
  onOpenClient,
  onOpenOrder,
  showCategoryColors
}: {
  order: OrderSummary;
  isMobile: boolean;
  onOpenClient: (clientId: number) => void;
  onOpenOrder: (orderId: number) => void;
  showCategoryColors: boolean;
}) {
  const accentBackground = showCategoryColors ? getOrderAccentBackground(order) : "var(--border)";
  const vehicleName = [order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ");
  const servicesText = order.service_names.length ? order.service_names.join(", ") : "Услуги не добавлены";
  const dueToday = order.due_date ? formatDateTime(order.due_date) : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenOrder(order.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenOrder(order.id);
        }
      }}
      className={cn(
        "relative overflow-hidden border border-border/70 bg-background/15",
        isMobile ? "rounded-[1.2rem] px-3 py-3" : "rounded-[1.4rem] px-4 py-4"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[4px]"
        style={{ background: accentBackground }}
      />
      <div className={cn("flex gap-3", isMobile ? "flex-col" : "items-start justify-between")}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenOrder(order.id);
              }}
              className={cn("font-semibold text-foreground hover:text-accent", isMobile ? "text-sm" : "text-base")}
            >
              #{order.id}
            </button>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenClient(order.client_id);
            }}
            className={cn("font-semibold text-foreground transition hover:text-accent", isMobile ? "mt-2 text-left text-sm" : "mt-3 text-left text-base")}
          >
            {order.client_full_name}
          </button>
          <div className={cn("mt-1 flex flex-wrap items-center text-muted-foreground", isMobile ? "gap-x-2 gap-y-1 text-xs" : "gap-x-3 gap-y-1 text-sm")}>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {order.client_phone}
            </span>
            <span>{order.vehicle_plate_number}</span>
            {vehicleName ? <span>{vehicleName}</span> : null}
          </div>
        </div>

        <div className={cn("shrink-0", isMobile ? "flex items-center justify-between gap-3" : "text-right")}>
          <p className={cn("font-semibold text-foreground", isMobile ? "text-sm" : "text-base")}>{formatCurrency(order.amount_to_pay)}</p>
          <div className={cn(isMobile ? "" : "mt-2 flex justify-end")}>
            <StatusBadge label={order.status_display_name || order.status} tone="muted" />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {dueToday ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success">
            <CircleAlert className="h-3.5 w-3.5" />
            Выполнить до {dueToday}
          </span>
        ) : null}
      </div>

      <div className={cn("rounded-2xl bg-black/10 text-muted-foreground", isMobile ? "mt-2 px-3 py-2 text-xs" : "mt-3 px-3 py-2 text-sm")}>{servicesText}</div>

      <div className={cn("mt-3 flex items-center justify-between gap-3", isMobile && "mt-2")}>
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Записан на</span>
        <QuickScheduleControl isMobile={isMobile} orderId={order.id} />
      </div>
    </article>
  );
}

function QuickScheduleControl({ isMobile, orderId }: { isMobile: boolean; orderId: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const orderQuery = useOrderDetailQuery(orderId);
  const updateMutation = useUpdateOrderMutation();

  const scheduledFor = orderQuery.data?.scheduled_for ?? "";
  const isBusy = orderQuery.isLoading || updateMutation.isPending;

  const handleChange = async (nextDate: string) => {
    if (!orderQuery.data) {
      return;
    }

    const values = mapOrderToFormValues(orderQuery.data);
    values.scheduled_for = nextDate;

    await updateMutation.mutateAsync({
      orderId,
      payload: mapFormValuesToOrderPayload(values)
    });
  };

  return (
    <div
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={isBusy}
        onClick={(event) => {
          event.stopPropagation();
          const input = inputRef.current;
          if (!input) {
            return;
          }
          if (!input.value) input.value = getDefaultDateTimeValue();
          if (typeof input.showPicker === "function") {
            input.showPicker();
            return;
          }
          input.click();
        }}
        className={cn("rounded-xl border border-border/70 bg-background/20 font-semibold text-foreground transition hover:border-accent/40 hover:bg-background/30 disabled:cursor-not-allowed", isMobile ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm")}
      >
        {isBusy ? (
          <span className="inline-flex items-center gap-1">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Сохр.
          </span>
        ) : (
          formatDateTime(scheduledFor)
        )}
      </button>
      <input
        ref={inputRef}
        className="pointer-events-none absolute inset-0 opacity-0"
        type="datetime-local"
        value={toLocalDateTimeInputValue(scheduledFor)}
        onChange={(event) => void handleChange(event.target.value)}
      />
    </div>
  );
}
