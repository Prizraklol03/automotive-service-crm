import type { OrderSummary } from "@/entities/order/model/types";
import type { CrmOrderStatus, OrderSortPreference } from "@/entities/settings/model/types";

export type OrderSortKey = OrderSortPreference["key"];
export type OrderSortDirection = OrderSortPreference["direction"];
export type OrderSortDescriptor = OrderSortPreference;

export const ORDER_SORT_KEYS: OrderSortKey[] = [
  "status",
  "scheduled_for",
  "id",
  "updated_at",
  "amount_to_pay",
  "client_full_name",
  "vehicle_plate_number",
  "vehicle_brand",
  "vehicle_model"
];

export const ORDER_SORT_LABELS: Record<OrderSortKey, string> = {
  amount_to_pay: "Сумма к оплате",
  client_full_name: "ФИО заказчика",
  id: "Номер заказа",
  scheduled_for: "Записан на",
  status: "Статус",
  updated_at: "Последнее изменение",
  vehicle_brand: "Марка",
  vehicle_model: "Модель",
  vehicle_plate_number: "Госномер"
};

export const DEFAULT_ORDER_SORTS: OrderSortDescriptor[] = [
  { key: "status", direction: "asc" },
  { key: "scheduled_for", direction: "asc" },
  { key: "id", direction: "desc" }
];

export const QUICK_ORDER_SORTS: Array<{ direction: OrderSortDirection; key: OrderSortKey; label: string }> = [
  { key: "updated_at", direction: "desc", label: "По последнему изменению" },
  { key: "scheduled_for", direction: "asc", label: "По записи" },
  { key: "amount_to_pay", direction: "desc", label: "По сумме к оплате" },
  { key: "client_full_name", direction: "asc", label: "По ФИО" },
  { key: "vehicle_plate_number", direction: "asc", label: "По госномеру" },
  { key: "vehicle_brand", direction: "asc", label: "По марке" },
  { key: "vehicle_model", direction: "asc", label: "По модели" }
];

export const ORDER_SORT_DEFAULT_DIRECTIONS: Record<OrderSortKey, OrderSortDirection> = {
  amount_to_pay: "desc",
  client_full_name: "asc",
  id: "desc",
  scheduled_for: "asc",
  status: "asc",
  updated_at: "desc",
  vehicle_brand: "asc",
  vehicle_model: "asc",
  vehicle_plate_number: "asc"
};

export function sortDescriptorsByPriority(descriptors: OrderSortDescriptor[]) {
  return [...descriptors];
}

export function normalizeOrderSortDescriptors(descriptors: OrderSortDescriptor[] | null | undefined) {
  const seen = new Set<OrderSortKey>();
  const normalized: OrderSortDescriptor[] = [];

  for (const descriptor of descriptors ?? []) {
    if (!ORDER_SORT_KEYS.includes(descriptor.key) || !["asc", "desc"].includes(descriptor.direction) || seen.has(descriptor.key)) {
      continue;
    }
    seen.add(descriptor.key);
    normalized.push(descriptor);
  }

  return normalized.length ? normalized : [...DEFAULT_ORDER_SORTS];
}

function compareValues(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), "ru-RU", { numeric: true });
}

function dateRank(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function buildStatusSortRankMap(statuses?: CrmOrderStatus[]) {
  const rankMap = new Map<string, number>();
  statuses?.forEach((status, index) => rankMap.set(status.code, index));
  return rankMap;
}

function getSortValue(order: OrderSummary, key: OrderSortKey, statusRankMap: Map<string, number>) {
  switch (key) {
    case "id":
      return order.id;
    case "scheduled_for":
      return dateRank(order.scheduled_for);
    case "status":
      return `${String(statusRankMap.get(order.status) ?? 999).padStart(3, "0")}:${order.status_display_name || order.status}`;
    case "updated_at":
      return dateRank(order.updated_at);
    case "amount_to_pay":
      return Number(order.amount_to_pay);
    case "client_full_name":
      return order.client_full_name;
    case "vehicle_plate_number":
      return order.vehicle_plate_number;
    case "vehicle_brand":
      return order.vehicle_brand ?? "";
    case "vehicle_model":
      return order.vehicle_model ?? "";
  }
}

export function sortOrders(
  orders: OrderSummary[],
  descriptors: OrderSortDescriptor[] = DEFAULT_ORDER_SORTS,
  statuses?: CrmOrderStatus[]
) {
  const activeDescriptors = normalizeOrderSortDescriptors(descriptors);
  const statusRankMap = buildStatusSortRankMap(statuses);

  return [...orders].sort((left, right) => {
    for (const descriptor of activeDescriptors) {
      const directionFactor = descriptor.direction === "asc" ? 1 : -1;
      const result = compareValues(
        getSortValue(left, descriptor.key, statusRankMap),
        getSortValue(right, descriptor.key, statusRankMap)
      );
      if (result !== 0) {
        return result * directionFactor;
      }
    }
    return right.id - left.id;
  });
}

export function toggleOrderSort(descriptors: OrderSortDescriptor[], key: OrderSortKey) {
  const index = descriptors.findIndex((descriptor) => descriptor.key === key);
  if (index === -1) {
    return [...descriptors, { key, direction: ORDER_SORT_DEFAULT_DIRECTIONS[key] }];
  }
  if (descriptors[index]?.direction === "asc") {
    return descriptors.map((descriptor, descriptorIndex) =>
      descriptorIndex === index ? { ...descriptor, direction: "desc" as const } : descriptor
    );
  }
  return descriptors.filter((_, descriptorIndex) => descriptorIndex !== index);
}

export function setOrderSortEnabled(descriptors: OrderSortDescriptor[], key: OrderSortKey, enabled: boolean) {
  const isEnabled = descriptors.some((descriptor) => descriptor.key === key);
  if (enabled === isEnabled) {
    return descriptors;
  }
  return enabled
    ? [...descriptors, { key, direction: ORDER_SORT_DEFAULT_DIRECTIONS[key] }]
    : descriptors.filter((descriptor) => descriptor.key !== key);
}

export function setOrderSortDirection(
  descriptors: OrderSortDescriptor[],
  key: OrderSortKey,
  direction: OrderSortDirection
) {
  return descriptors.map((descriptor) => (descriptor.key === key ? { ...descriptor, direction } : descriptor));
}

export function reorderOrderSortDescriptors(
  descriptors: OrderSortDescriptor[],
  activeKey: OrderSortKey,
  overKey: OrderSortKey
) {
  const fromIndex = descriptors.findIndex((descriptor) => descriptor.key === activeKey);
  const toIndex = descriptors.findIndex((descriptor) => descriptor.key === overKey);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return descriptors;
  }
  const next = [...descriptors];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}
