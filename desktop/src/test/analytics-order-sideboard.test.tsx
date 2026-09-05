import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AnalyticsDashboard } from "@/entities/analytics/model/types";

const emptyDashboard: AnalyticsDashboard = {
  clients: { chart_groups: [], kpis: [], rows: [], segments: [] },
  filter: {
    category_ids: [],
    date_from: null,
    date_to: null,
    finance_category_ids: [],
    order_statuses: [],
    period_preset: "working_month"
  },
  finances: { category_rows: [], chart_groups: [], kpis: [], rows: [] },
  generated_at: "2026-06-24T00:00:00",
  orders: {
    chart_groups: [],
    funnel: [],
    kpis: [],
    rows: [
      {
        amount_to_pay: "1500.00",
        category_names: ["Детейлинг"],
        client_id: 1,
        client_name: "Demo Customer 03",
        completed_at: "2026-06-20T10:00:00",
        completion_hours: "2.5",
        date: "2026-06-20T10:00:00",
        discount_total: "0.00",
        employee_name: null,
        gross_profit: "800.00",
        id: 42,
        materials_total: "200.00",
        services_total: "1500.00",
        status: "closed",
        vehicle_id: 2,
        vehicle_label: "A777AA00"
      }
    ]
  },
  overview: {
    chart_groups: [],
    insights: [],
    kpis_row_1: [],
    kpis_row_2: [],
    latest_finances: [],
    top_categories: [],
    top_clients: [],
    top_services: [],
    waterfall: []
  },
  services: { category_rows: [], service_rows: [] },
  supplies: { kpis: [], rows: [], top_categories: [], top_materials: [], top_orders: [] }
};

const dashboardQueryState = {
  data: emptyDashboard,
  isError: false,
  isLoading: false,
  refetch: () => undefined
};

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/shared/hooks/use-order-detail-version", () => ({
  useOrderDetailVersion: () => ({ version: "modern" })
}));

vi.mock("@/features/analytics/api/analytics-hooks", () => ({
  useAnalyticsDashboardQuery: () => dashboardQueryState,
  useAnalyticsDrilldownQuery: () => ({ data: { rows: [] }, isLoading: false })
}));

vi.mock("@/features/analytics/ui/analytics-chart", () => ({
  AnalyticsChart: () => <div data-testid="analytics-chart" />
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [] })
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useOrderStatusesQuery: () => ({ data: [] }),
  useVisualConfigQuery: () => ({ data: { working_month_start_day: 25 } })
}));

vi.mock("@/features/orders/ui/order-detail-panel", () => ({
  OrderDetailPanel: ({ desktopMode, onClose, orderKey }: { desktopMode?: string; onClose: () => void; orderKey: string | null }) => (
    <div data-testid="order-sideboard" data-desktop-mode={desktopMode}>
      <span>{orderKey}</span>
      <button type="button" onClick={onClose}>
        Close order
      </button>
    </div>
  )
}));

import { AnalyticsPage } from "@/pages/analytics-page";

function mount(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    root,
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location-probe" data-pathname={location.pathname} data-search={location.search} />
  );
}

function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button "${text}" not found`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("opening an order from analytics", () => {
  it("opens the order sideboard over analytics without navigating to /orders", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/analytics?tab=orders"]}>
        <LocationProbe />
        <AnalyticsPage />
      </MemoryRouter>
    );

    expect(container.querySelector('[data-testid="order-sideboard"]')).toBeNull();

    clickButtonByText(container, "Заказ #42");

    const sideboard = container.querySelector('[data-testid="order-sideboard"]');
    expect(sideboard).not.toBeNull();
    expect(sideboard?.getAttribute("data-desktop-mode")).toBe("docked");
    expect(sideboard?.textContent).toContain("42");

    const probe = container.querySelector('[data-testid="location-probe"]');
    expect(probe?.getAttribute("data-pathname")).toBe("/analytics");

    clickButtonByText(container, "Close order");
    expect(container.querySelector('[data-testid="order-sideboard"]')).toBeNull();
    expect(probe?.getAttribute("data-pathname")).toBe("/analytics");

    unmount();
  });
});
