import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OrderSummary } from "@/entities/order/model/types";
import { OrdersList } from "@/features/orders/ui/orders-list";

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useOrderStatusesQuery: () => ({
    data: [
      {
        code: "in_progress",
        color: "#3b82f6",
        display_name: "В работе",
        is_default: false,
        sort_order: 1,
        status_group: "in_progress",
      },
    ],
  }),
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useUpdateOrderMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useUpdateOrderStatusMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/shared/hooks/use-color-palette", () => ({
  useColorPalette: () => ({
    enabled: false,
  }),
}));

function order(overrides: Partial<OrderSummary>): OrderSummary {
  return {
    amount_to_pay: "2500.00",
    category_colors: [],
    client_full_name: "Тестовый Клиент 02",
    client_id: 1,
    client_phone: "+70000000039",
    comment: "Нужна срочная мойка",
    completed_at: null,
    discount_type: "fixed",
    discount_value: "0.00",
    due_date: null,
    handover_at: null,
    id: 12,
    is_archived: false,
    balance_due: "2500.00",
    paid_total: "0.00",
    payment_status: "unpaid",
    primary_category_color: null,
    primary_category_name: null,
    scheduled_for: null,
    service_names: ["Мойка"],
    services_total: "2500.00",
    status: "in_progress",
    status_changed_at: "2026-04-23T10:30:00",
    status_color: "#3b82f6",
    status_display_name: "В работе",
    status_group: "in_progress",
    vehicle_brand: "BMW",
    vehicle_id: 3,
    vehicle_model: "X5",
    vehicle_plate_number: "A001AA00",
    vehicle_vin: null,
    ...overrides,
  };
}

describe("orders list status styling", () => {
  it("uses dynamic status css variables for order status trigger", () => {
    const html = renderToStaticMarkup(
      <OrdersList
        isMobile={false}
        onOpenOrder={vi.fn()}
        orders={[order({})]}
        selectedOrderId={null}
      />,
    );

    expect(html).toContain("aria-label=\"Изменить статус заказа\"");
    expect(html).toContain("background-color:var(--status-in-progress-bg, hsl(220 9% 32%))");
    expect(html).toContain("color:var(--status-in-progress-text, hsl(0 0% 100%))");
    expect(html).toContain("Не оплачено");
  });

  it("keeps the eight-column desktop table order and compact responsive grid", () => {
    const html = renderToStaticMarkup(
      <OrdersList
        isMobile={false}
        onOpenOrder={vi.fn()}
        orders={[order({ client_full_name: "Тестовый Клиент 06", client_phone: "+7 (000) 000-00-42" })]}
        selectedOrderId={null}
        viewMode="rows"
      />,
    );

    const headings = ["Заказ", "Клиент", "Автомобиль", "Статус", "Записан на", "Выдать авто", "К оплате", "Документы"];
    headings.reduce((previousIndex, heading) => {
      const nextIndex = html.indexOf(heading, previousIndex + 1);
      expect(nextIndex).toBeGreaterThan(previousIndex);
      return nextIndex;
    }, -1);

    expect(html).toContain('data-testid="orders-table-scroll"');
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain('data-testid="orders-table-canvas"');
    expect(html).toContain("min-w-[1320px]");
    expect(html).toContain("grid-cols-[96px_minmax(240px,1.7fr)_minmax(165px,1fr)_150px_150px_118px_124px_170px]");
    expect(html).toContain("Тестовый Клиент 06");
    expect(html).toContain("+7 (000) 000-00-42");
    expect(html).not.toContain("orders-card-grid");
  });

  it("forces the existing card layout on mobile even when rows mode is selected", () => {
    const html = renderToStaticMarkup(
      <OrdersList
        isMobile
        onOpenOrder={vi.fn()}
        orders={[order({ client_full_name: "Demo Customer 26" })]}
        selectedOrderId={null}
        viewMode="rows"
      />,
    );

    expect(html).toContain("Demo Customer 26");
    expect(html).not.toContain('data-testid="orders-table-scroll"');
    expect(html).not.toContain('data-testid="orders-table-canvas"');
    expect(html).not.toContain("orders-table-header");
  });
});
