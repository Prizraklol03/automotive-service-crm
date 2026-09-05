import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

function formatDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

const todayKey = formatDayKey(new Date());

const order = {
  amount_to_pay: "1500.00",
  balance_due: "1500.00",
  category_colors: [],
  client_full_name: "Demo Customer 03",
  client_id: 1,
  client_phone: "+70000000001",
  comment: null,
  completed_at: null,
  discount_type: "fixed",
  discount_value: "0.00",
  due_date: null,
  handover_at: null,
  id: 77,
  is_archived: false,
  paid_total: "0.00",
  payment_status: "unpaid",
  primary_category_color: null,
  primary_category_name: null,
  scheduled_for: `${todayKey}T10:00:00`,
  service_names: ["Wash"],
  services_total: "1500.00",
  status: "new",
  status_color: "#6b7280",
  status_display_name: "Новый",
  status_group: "new",
  status_changed_at: null,
  vehicle_brand: "Lada",
  vehicle_id: 2,
  vehicle_model: "Vesta",
  vehicle_plate_number: "A777AA00",
  vehicle_vin: null
};

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/shared/hooks/use-order-detail-version", () => ({
  useOrderDetailVersion: () => ({ version: "modern" })
}));

vi.mock("@/shared/hooks/use-color-palette", () => ({
  useColorPalette: () => ({ enabled: true, setEnabled: () => undefined })
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useOrderDetailQuery: () => ({ data: null, isLoading: false }),
  useOrdersListQuery: () => ({ data: [order], isError: false, isLoading: false, refetch: () => undefined }),
  useUpdateOrderMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/notifications/api/notifications-hooks", () => ({
  useNotificationsListQuery: () => ({ data: [], isError: false, isLoading: false, refetch: () => undefined })
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [] })
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

import { CalendarPage } from "@/pages/calendar-page";

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
  return <div data-testid="location-probe" data-pathname={location.pathname} data-search={location.search} />;
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

describe("opening an order from the calendar", () => {
  it("opens the order sideboard over the calendar without navigating to /orders", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/calendar"]}>
        <LocationProbe />
        <CalendarPage />
      </MemoryRouter>
    );

    expect(container.querySelector('[data-testid="order-sideboard"]')).toBeNull();

    clickButtonByText(container, "#77");

    const sideboard = container.querySelector('[data-testid="order-sideboard"]');
    expect(sideboard).not.toBeNull();
    expect(sideboard?.getAttribute("data-desktop-mode")).toBe("docked");

    const probe = container.querySelector('[data-testid="location-probe"]');
    expect(probe?.getAttribute("data-pathname")).toBe("/calendar");

    clickButtonByText(container, "Close order");
    expect(container.querySelector('[data-testid="order-sideboard"]')).toBeNull();
    expect(probe?.getAttribute("data-pathname")).toBe("/calendar");

    unmount();
  });
});
