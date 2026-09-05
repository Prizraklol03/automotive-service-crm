import type { OrderSummary } from "@/entities/order/model/types";
import type { CrmOrderStatus } from "@/entities/settings/model/types";
import { getUniqueOrderAccentColors } from "@/features/orders/model/order-category-colors";
import {
  DEFAULT_ORDER_SORTS,
  normalizeOrderSortDescriptors,
  reorderOrderSortDescriptors,
  setOrderSortEnabled,
  sortOrders,
  toggleOrderSort
} from "@/features/orders/model/order-sorting";
import { calculateActivePayableAmount } from "@/features/orders/model/order-summary";

function order(overrides: Partial<OrderSummary>): OrderSummary {
  return {
    amount_to_pay: "0.00",
    category_colors: [],
    client_full_name: "Client",
    client_id: 1,
    client_phone: "+70000000039",
    comment: null,
    completed_at: null,
    discount_type: "fixed",
    discount_value: "0.00",
    due_date: null,
    handover_at: null,
    id: 1,
    is_archived: false,
    balance_due: "0.00",
    paid_total: "0.00",
    payment_status: "unpaid",
    primary_category_color: null,
    primary_category_name: null,
    scheduled_for: null,
    service_names: [],
    services_total: "0.00",
    status: "new",
    status_display_name: "Новый",
    status_group: "new",
    status_color: "#6b7280",
    status_changed_at: null,
    updated_at: "2026-04-01T09:00:00",
    vehicle_brand: null,
    vehicle_id: 1,
    vehicle_model: null,
    vehicle_plate_number: "A001AA00",
    vehicle_vin: null,
    ...overrides
  };
}

const statuses: CrmOrderStatus[] = [
  { code: "new", color: "#6b7280", display_name: "Новый", is_default: true, sort_order: 10, status_group: "new" },
  { code: "in_progress", color: "#10b981", display_name: "В работе", is_default: false, sort_order: 20, status_group: "in_progress" },
  { code: "done", color: "#22c55e", display_name: "Готово", is_default: false, sort_order: 30, status_group: "done" },
  { code: "closed", color: "#0f766e", display_name: "Выдан", is_default: false, sort_order: 40, status_group: "closed" },
  { code: "cancelled", color: "#ef4444", display_name: "Отменён", is_default: false, sort_order: 50, status_group: "cancelled" },
];

describe("order sorting", () => {
  it("sorts by configured status order, scheduled datetime, then order number by default", () => {
    const sorted = sortOrders(
      [
        order({ id: 3, status: "new", scheduled_for: "2026-04-10T12:00:00" }),
        order({ id: 2, status: "in_progress", scheduled_for: "2026-04-10T12:00:00" }),
        order({ id: 1, status: "in_progress", scheduled_for: "2026-04-10T09:00:00" }),
        order({ id: 4, status: "done", scheduled_for: "2026-04-09T09:00:00" })
      ],
      DEFAULT_ORDER_SORTS,
      statuses,
    );

    expect(sorted.map((item) => item.id)).toEqual([3, 1, 2, 4]);
  });

  it("uses descending order number in the default sorting when higher-priority fields are equal", () => {
    const sorted = sortOrders(
      [
        order({ id: 11, status: "in_progress", scheduled_for: "2026-04-10T12:00:00" }),
        order({ id: 15, status: "in_progress", scheduled_for: "2026-04-10T12:00:00" })
      ],
      DEFAULT_ORDER_SORTS,
      statuses,
    );

    expect(sorted.map((item) => item.id)).toEqual([15, 11]);
  });

  it("preserves configured priority and applies it in that order", () => {
    const descriptors = toggleOrderSort(toggleOrderSort(toggleOrderSort([], "id"), "scheduled_for"), "status");
    const sorted = sortOrders(
      [
        order({ id: 1, status: "new", scheduled_for: "2026-04-10T09:00:00" }),
        order({ id: 2, status: "in_progress", scheduled_for: "2026-04-12T09:00:00" })
      ],
      descriptors,
      statuses,
    );

    expect(descriptors.map((descriptor) => descriptor.key)).toEqual(["id", "scheduled_for", "status"]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("normalizes supported criteria without changing saved drag priority", () => {
    expect(
      normalizeOrderSortDescriptors([
        { key: "vehicle_model", direction: "asc" },
        { key: "amount_to_pay", direction: "desc" },
        { key: "status", direction: "asc" }
      ]).map((descriptor) => descriptor.key)
    ).toEqual(["vehicle_model", "amount_to_pay", "status"]);
  });

  it("enables, disables, and reorders individual criteria", () => {
    const disabled = setOrderSortEnabled(DEFAULT_ORDER_SORTS, "scheduled_for", false);
    const enabled = setOrderSortEnabled(disabled, "vehicle_brand", true);
    const reordered = reorderOrderSortDescriptors(enabled, "vehicle_brand", "status");

    expect(disabled.map((descriptor) => descriptor.key)).toEqual(["status", "id"]);
    expect(enabled.at(-1)).toEqual({ key: "vehicle_brand", direction: "asc" });
    expect(reordered.map((descriptor) => descriptor.key)).toEqual(["vehicle_brand", "status", "id"]);
  });

  it.each([
    ["updated_at", { updated_at: "2026-04-02T09:00:00" }],
    ["amount_to_pay", { amount_to_pay: "200.00" }],
    ["client_full_name", { client_full_name: "Zulu" }],
    ["vehicle_plate_number", { vehicle_plate_number: "Z999ZZ77" }],
    ["vehicle_brand", { vehicle_brand: "Volvo" }],
    ["vehicle_model", { vehicle_model: "XC90" }]
  ] as const)("sorts by %s", (key, changedFields) => {
    const sorted = sortOrders(
      [order({ id: 1 }), order({ id: 2, ...changedFields })],
      [{ key, direction: "desc" }],
      statuses
    );
    expect(sorted[0]?.id).toBe(2);
  });
});

describe("order category colors", () => {
  it("keeps all unique colors from a single multi-category order without duplicates", () => {
    const colors = getUniqueOrderAccentColors([
      order({
        category_colors: ["#AA0000", "#00AA00", "#aa0000"],
        primary_category_color: "#0000AA"
      })
    ]);

    expect(colors).toEqual(["#AA0000", "#00AA00"]);
  });
});

describe("order summary", () => {
  it("excludes new and archived orders from active payable amount", () => {
    expect(
      calculateActivePayableAmount([
        order({ amount_to_pay: "1000.00", status: "in_progress" }),
        order({ amount_to_pay: "500.00", status: "new" }),
        order({ amount_to_pay: "700.00", is_archived: true, status: "closed" })
      ])
    ).toBe(1000);
  });
});
