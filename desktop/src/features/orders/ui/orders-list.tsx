import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FileDown, LoaderCircle } from "lucide-react";

import { downloadOrderDocumentDocxRequestPath } from "@/entities/document/api/document-api";
import { DOCUMENT_TYPE_SHORT_LABELS, type DocumentType } from "@/entities/document/model/types";
import { getOrderRequest } from "@/entities/order/api/order-api";
import type { OrderStatus, OrderSummary } from "@/entities/order/model/types";
import {
  getOrderPaymentStatusLabel,
  getOrderPaymentStatusTone
} from "@/entities/order-payment/model/types";
import { useOrderStatusesQuery } from "@/features/settings/api/settings-hooks";
import { useUpdateOrderMutation, useUpdateOrderStatusMutation } from "@/features/orders/api/orders-hooks";
import { mapFormValuesToOrderPayload, mapOrderToFormValues } from "@/features/orders/model/order-form";
import type { OrderSortDescriptor, OrderSortKey } from "@/features/orders/model/order-sorting";
import { ApiError } from "@/shared/api/client";
import type { OrdersViewMode } from "@/shared/hooks/use-orders-view-mode";
import { useColorPalette } from "@/shared/hooks/use-color-palette";
import { getOrderStatusBadgeStyle } from "@/shared/hooks/use-visual-theme";
import { cn } from "@/shared/lib/cn";
import { downloadFile } from "@/shared/lib/download";
import { getDefaultDateTimeValue, toLocalDateTimeInputValue } from "@/shared/lib/datetime";
import { formatCurrency, formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

type OrdersListProps = {
  isMobile: boolean;
  onOpenOrder: (orderId: number) => void;
  onPrefetchOrder?: (orderId: number) => void;
  onToggleSort?: (key: OrderSortKey) => void;
  orders: OrderSummary[];
  selectedOrderId: number | null;
  sortDescriptors?: OrderSortDescriptor[];
  viewMode?: OrdersViewMode;
};

type DropdownPosition = {
  left: number;
  top: number;
  width: number;
};

const QUICK_DOCUMENT_TYPES: DocumentType[] = ["preliminary_work_order", "work_order", "completion_act", "inspection_act"];
const ORDERS_TABLE_GRID_CLASS =
  "grid-cols-[96px_minmax(240px,1.7fr)_minmax(165px,1fr)_150px_150px_118px_124px_170px]";

function OrderSummarySnippet({ comment }: { comment: string | null }) {
  return <p className="line-clamp-2 text-sm text-muted-foreground">{comment?.trim() || "Без комментария"}</p>;
}

function updateOrderDateField(orderId: number, field: "handover_at" | "scheduled_for", nextDate: string) {
  return getOrderRequest(orderId).then((order) => {
    const values = mapOrderToFormValues(order);
    values[field] = nextDate;

    return {
      orderId,
      payload: mapFormValuesToOrderPayload(values)
    };
  });
}

function vehicleModelLabel(order: OrderSummary) {
  return [order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ");
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

  return order.primary_category_color ? [order.primary_category_color] : ["var(--border)"];
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

export function OrdersList({
  isMobile,
  onOpenOrder,
  onPrefetchOrder,
  onToggleSort,
  orders,
  selectedOrderId,
  sortDescriptors = [],
  viewMode = "cards"
}: OrdersListProps) {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [openStatusOrderId, setOpenStatusOrderId] = useState<number | null>(null);
  const updateOrderStatusMutation = useUpdateOrderStatusMutation();
  const { enabled: showCategoryColors } = useColorPalette();

  if (!orders.length) {
    return <EmptyState title="Заказы не найдены" description="Попробуйте изменить поиск или фильтры." />;
  }

  const handleQuickDownload = async (event: MouseEvent, orderId: number, documentType: DocumentType) => {
    event.stopPropagation();
    const key = `${orderId}:${documentType}`;
    try {
      setDownloadingKey(key);
      await downloadFile(downloadOrderDocumentDocxRequestPath(orderId, documentType), null, { method: "POST" });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleStatusChange = async (orderId: number, currentStatus: OrderStatus, nextStatus: OrderStatus) => {
    if (currentStatus === nextStatus) {
      return;
    }

    try {
      setStatusError(null);
      setOpenStatusOrderId(null);
      setUpdatingOrderId(orderId);
      await updateOrderStatusMutation.mutateAsync({ orderId, status: nextStatus });
    } catch (error) {
      setStatusError(error instanceof ApiError ? error.message : "Не удалось изменить статус заказа.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const renderOrderCard = (order: OrderSummary) => (
    <div
      key={order.id}
      onClick={() => onOpenOrder(order.id)}
      onMouseEnter={() => onPrefetchOrder?.(order.id)}
      className={cn(
        "glass-panel relative cursor-pointer overflow-hidden rounded-xl p-4 text-left transition-colors hover:bg-surface-2/80",
        selectedOrderId === order.id && "border-accent/60"
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenOrder(order.id);
        }
      }}
    >
      {showCategoryColors ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[4px]"
          style={{ background: getOrderAccentBackground(order) }}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Заказ #{order.id}</h3>
            <span className="text-xs text-muted-foreground">{order.is_archived ? "Архив" : "Активный"}</span>
          </div>
          <p className="mt-1 truncate text-sm text-foreground">{order.client_full_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{order.client_phone}</p>
        </div>
        <div onClick={(event) => event.stopPropagation()}>
          <OrderStatusDropdown
            disabled={updatingOrderId === order.id}
            isOpen={openStatusOrderId === order.id}
            onChange={(nextStatus) => void handleStatusChange(order.id, order.status, nextStatus)}
            onOpenChange={(nextOpen) => setOpenStatusOrderId(nextOpen ? order.id : null)}
            status={order.status}
          />
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <OrderSummarySnippet comment={order.comment} />
      </div>

      <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-[minmax(0,1fr)_160px_160px] sm:items-start">
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{order.vehicle_plate_number || "Без номера"}</div>
          <div className="mt-1 truncate">{vehicleModelLabel(order) || "Марка и модель не указаны"}</div>
        </div>
        <div className="text-left sm:text-center" onClick={(event) => event.stopPropagation()}>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Записан на</div>
          <div className="mt-1 flex sm:justify-center">
            <QuickOrderDateControl isMobile orderId={order.id} value={order.scheduled_for} field="scheduled_for" />
          </div>
        </div>

        <div className="text-left sm:text-center" onClick={(event) => event.stopPropagation()}>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Выдать авто</div>
          <div className="mt-1 flex sm:justify-center">
            <QuickOrderDateControl isMobile orderId={order.id} value={order.handover_at} field="handover_at" />
          </div>
        </div>
        <div className="hidden">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">К оплате</div>
          <div className="mt-1 text-base font-semibold text-foreground">{formatCurrency(order.amount_to_pay)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" onClick={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_DOCUMENT_TYPES.map((documentType) => {
            const key = `${order.id}:${documentType}`;
            return (
              <AppButton
                key={documentType}
                size="sm"
                variant="outline"
                disabled={downloadingKey === key}
                onClick={(event) => void handleQuickDownload(event, order.id, documentType)}
              >
                <FileDown className="h-4 w-4" />
                {downloadingKey === key ? "..." : DOCUMENT_TYPE_SHORT_LABELS[documentType]}
              </AppButton>
            );
          })}
        </div>
        <div className="sm:ml-auto sm:min-w-[148px] sm:text-right">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">К оплате</div>
          <div className="mt-1 text-base font-semibold text-foreground">{formatCurrency(order.amount_to_pay)}</div>
          <div className="mt-2 flex sm:justify-end">
            <StatusBadge
              label={getOrderPaymentStatusLabel(order.payment_status)}
              tone={getOrderPaymentStatusTone(order.payment_status)}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        {order.status_changed_at ? `Обновление: ${formatDateTime(order.status_changed_at)}` : "Без обновлений"}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        {statusError ? <InlineStatusError message={statusError} /> : null}
        {orders.map(renderOrderCard)}
      </div>
    );
  }

  if (viewMode === "cards") {
    return (
      <div className="space-y-3">
        {statusError ? <InlineStatusError message={statusError} /> : null}
        <div className="orders-card-grid grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">{orders.map(renderOrderCard)}</div>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-x-auto rounded-2xl" data-testid="orders-table-scroll">
      {statusError ? <InlineStatusError message={statusError} /> : null}
      <div className="min-w-[1320px]" data-testid="orders-table-canvas">
        <div className={cn("orders-table-header grid gap-3 border-b border-border bg-surface-2/70 px-3 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground", ORDERS_TABLE_GRID_CLASS)}>
          <SortHeader columnKey="id" label="Заказ" onToggleSort={onToggleSort} sortDescriptors={sortDescriptors} />
          <span>Клиент</span>
          <span>Автомобиль</span>
          <SortHeader columnKey="status" label="Статус" onToggleSort={onToggleSort} sortDescriptors={sortDescriptors} />
          <SortHeader columnKey="scheduled_for" label="Записан на" onToggleSort={onToggleSort} sortDescriptors={sortDescriptors} />
          <span>Выдать авто</span>
          <span className="text-right">К оплате</span>
          <span className="text-right">Документы</span>
        </div>
        <div className="divide-y divide-border">
          {orders.map((order) => (
            <div
              key={order.id}
              onMouseEnter={() => onPrefetchOrder?.(order.id)}
              className={cn(
                "orders-table-row grid cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-surface-2/50",
                ORDERS_TABLE_GRID_CLASS,
                selectedOrderId === order.id && "bg-accent-muted/60"
              )}
            >
              <button type="button" onClick={() => onOpenOrder(order.id)} className="cursor-pointer text-left">
                <div className="font-semibold">#{order.id}</div>
                <div className="mt-1 text-xs text-muted-foreground">{order.is_archived ? "Завершённый" : "Активный"}</div>
                <div className="mt-2 text-xs text-muted-foreground">Обновление: {formatDateTime(order.status_changed_at)}</div>
              </button>
              <button type="button" onClick={() => onOpenOrder(order.id)} className="min-w-0 cursor-pointer text-left">
                <div className="font-medium">{order.client_full_name}</div>
                <div className="mt-1">
                  <OrderSummarySnippet comment={order.comment} />
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{order.client_phone}</div>
              </button>
              <button type="button" onClick={() => onOpenOrder(order.id)} className="cursor-pointer text-left text-sm text-muted-foreground">
                <div>{order.vehicle_plate_number}</div>
                <div className="mt-1">{vehicleModelLabel(order) || "Марка и модель не указаны"}</div>
              </button>
              <div className="flex items-start">
                <OrderStatusDropdown
                  disabled={updatingOrderId === order.id}
                  isOpen={openStatusOrderId === order.id}
                  onChange={(nextStatus) => void handleStatusChange(order.id, order.status, nextStatus)}
                  onOpenChange={(nextOpen) => setOpenStatusOrderId(nextOpen ? order.id : null)}
                  status={order.status}
                />
              </div>
              <div className="flex items-start" onClick={(event) => event.stopPropagation()}>
                <QuickOrderDateControl orderId={order.id} value={order.scheduled_for} field="scheduled_for" />
              </div>

              <div className="flex items-start" onClick={(event) => event.stopPropagation()}>
                <QuickOrderDateControl orderId={order.id} value={order.handover_at} field="handover_at" />
              </div>
              <button type="button" onClick={() => onOpenOrder(order.id)} className="cursor-pointer text-right">
                <div className="font-semibold">{formatCurrency(order.amount_to_pay)}</div>
                <div className="mt-2 flex justify-end">
                  <StatusBadge
                    label={getOrderPaymentStatusLabel(order.payment_status)}
                    tone={getOrderPaymentStatusTone(order.payment_status)}
                  />
                </div>
              </button>
              <div className="flex flex-wrap justify-end gap-2">
                {QUICK_DOCUMENT_TYPES.map((documentType) => {
                  const key = `${order.id}:${documentType}`;
                  return (
                    <AppButton
                      key={documentType}
                      size="sm"
                      variant="outline"
                      disabled={downloadingKey === key}
                      onClick={(event) => void handleQuickDownload(event, order.id, documentType)}
                    >
                      <FileDown className="h-4 w-4" />
                      {downloadingKey === key ? "..." : DOCUMENT_TYPE_SHORT_LABELS[documentType]}
                    </AppButton>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InlineStatusError({ message }: { message: string }) {
  return <div className="border-b border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{message}</div>;
}

function QuickOrderDateControl({
  isMobile = false,

  field,
  orderId,
  value
}: {
  isMobile?: boolean;
  orderId: number;
  field: "handover_at" | "scheduled_for";

  value: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateMutation = useUpdateOrderMutation();
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updatePointerMode = () => setIsCoarsePointer(mediaQuery.matches);
    updatePointerMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePointerMode);
      return () => mediaQuery.removeEventListener("change", updatePointerMode);
    }

    mediaQuery.addListener(updatePointerMode);
    return () => mediaQuery.removeListener(updatePointerMode);
  }, []);

  const handleChange = async (nextDate: string) => {

    const nextPayload = await updateOrderDateField(orderId, field, nextDate);

    await updateMutation.mutateAsync(nextPayload);

  };

  return (
    <div
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={updateMutation.isPending}
        onClick={(event) => {
          event.stopPropagation();
          const input = inputRef.current;
          if (!input || isCoarsePointer) {
            return;
          }
          if (!input.value) input.value = getDefaultDateTimeValue();
          if (typeof input.showPicker === "function") {
            input.showPicker();
            return;
          }
          input.click();
        }}
        className={cn(
          "cursor-pointer rounded-xl border border-border/70 bg-background/20 font-semibold text-foreground transition hover:border-accent/40 hover:bg-background/30 disabled:cursor-not-allowed",
          isMobile ? "min-h-10 px-3.5 py-2 text-sm" : "px-3 py-1.5 text-sm"
        )}
      >
        {updateMutation.isPending ? (
          <span className="inline-flex items-center gap-1">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Сохр.
          </span>
        ) : (
          formatDateTime(value)
        )}
      </button>
      <input
        ref={inputRef}
        className={cn(
          "absolute inset-0 opacity-0",
          isCoarsePointer ? "z-10 cursor-pointer" : "pointer-events-none"
        )}
        type="datetime-local"
        value={toLocalDateTimeInputValue(value)}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => {
          event.stopPropagation();
          if (!event.target.value) event.target.value = getDefaultDateTimeValue();
        }}
        onChange={(event) => void handleChange(event.target.value)}
      />
    </div>
  );
}

function SortHeader({
  columnKey,
  label,
  onToggleSort,
  sortDescriptors
}: {
  columnKey: OrderSortKey;
  label: string;
  onToggleSort?: (key: OrderSortKey) => void;
  sortDescriptors: OrderSortDescriptor[];
}) {
  const descriptor = sortDescriptors.find((item) => item.key === columnKey) ?? null;
  const marker = descriptor ? (descriptor.direction === "asc" ? "^" : "v") : "";

  if (!onToggleSort) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onToggleSort(columnKey)}
      className="inline-flex cursor-pointer items-center gap-1 text-left uppercase tracking-[0.18em] transition-colors hover:text-foreground"
    >
      <span>{label}</span>
      {marker ? <span className="text-[10px] text-accent">{marker}</span> : null}
    </button>
  );
}

function OrderStatusDropdown({
  disabled,
  isOpen,
  onChange,
  onOpenChange,
  status
}: {
  disabled?: boolean;
  isOpen: boolean;
  onChange: (status: OrderStatus) => void;
  onOpenChange: (isOpen: boolean) => void;
  status: OrderStatus;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const orderStatusesQuery = useOrderStatusesQuery();
  const statusOptions = useMemo(() => {
    if (orderStatusesQuery.data && orderStatusesQuery.data.length > 0) {
      return orderStatusesQuery.data.map((s) => ({ value: s.code, label: s.display_name }));
    }
    return [{ value: status, label: status }];
  }, [orderStatusesQuery.data, status]);

  const selectedIndex = useMemo(
    () => Math.max(0, statusOptions.findIndex((option) => option.value === status)),
    [status, statusOptions]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setHighlightedIndex(selectedIndex);
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, isOpen]);

  const toggleOpen = () => {
    if (!disabled) {
      onOpenChange(!isOpen);
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenChange(true);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % statusOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + statusOptions.length) % statusOptions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(statusOptions.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenChange(false);
      const nextOption = statusOptions[highlightedIndex];
      if (nextOption) {
        onChange(nextOption.value);
      }
      return;
    }

    if (event.key === "Tab") {
      onOpenChange(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Изменить статус заказа"
        className={cn(
          "inline-flex h-9 min-w-[148px] cursor-pointer items-center justify-between rounded-full px-3 py-1 text-sm font-medium shadow-none transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "border border-transparent"
        )}
        style={getOrderStatusBadgeStyle(status)}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          toggleOpen();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{statusOptions.find(o => o.value === status)?.label ?? status}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[120] overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-panel"
              style={{
                left: position.left,
                top: position.top,
                width: Math.max(position.width, 172)
              }}
              role="listbox"
              onKeyDown={handleMenuKeyDown}
            >
              {statusOptions.map((option, index) => {
                const isSelected = option.value === status;
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm text-foreground outline-none transition-colors",
                      isHighlighted ? "bg-surface-2" : "hover:bg-surface-2/60"
                    )}
                    style={isSelected ? getOrderStatusBadgeStyle(option.value) : undefined}
                    onClick={() => {
                      onOpenChange(false);
                      onChange(option.value);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <Check className="h-4 w-4 text-white" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
