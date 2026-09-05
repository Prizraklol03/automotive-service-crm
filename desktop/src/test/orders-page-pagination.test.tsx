import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pageCalls: Array<Record<string, unknown>> = [];
const summaryCalls: Array<Record<string, unknown>> = [];

const orderStatusesData = [
  { code: "new", color: "#6b7280", display_name: "Новый", is_default: true, sort_order: 10, status_group: "new" }
];
const userPreferencesData = { order_sorting: [] as unknown[] };
const authUser = { id: 1, permissions: [] as string[], role_code: "standard_user" as const };

const orderOne = {
  amount_to_pay: "1000.00",
  balance_due: "1000.00",
  category_colors: [],
  client_full_name: "Demo Customer 03",
  client_id: 1,
  client_phone: "+7 (000) 000-00-43",
  comment: "First order",
  completed_at: null,
  discount_type: "fixed",
  discount_value: "0.00",
  due_date: null,
  handover_at: null,
  id: 1,
  is_archived: false,
  paid_total: "0.00",
  payment_status: "unpaid",
  primary_category_color: null,
  primary_category_name: null,
  scheduled_for: null,
  service_names: ["Wash"],
  services_total: "1000.00",
  status: "new",
  status_color: "#6b7280",
  status_display_name: "Новый",
  status_group: "new",
  status_changed_at: null,
  vehicle_brand: "Toyota",
  vehicle_id: 2,
  vehicle_model: "Camry",
  vehicle_plate_number: "A123BC00",
  vehicle_vin: "VIN123"
};

const orderTwo = {
  ...orderOne,
  id: 2,
  client_full_name: "Demo Customer 11",
  client_id: 2,
  vehicle_id: 3,
  vehicle_model: "RAV4",
  vehicle_plate_number: "B234BC00"
};

const summaryResult = {
  active_amount_to_pay: "0.00",
  active_in_progress_total: 0,
  active_total: 0,
  active_waiting_total: 0,
  archived_total: 0,
  status_counts: {},
  total: 2
};

const queryState = {
  data: {
    items: [orderOne],
    page: 1,
    page_size: 50,
    total: 2
  },
  hasNextPage: true,
  isError: false,
  isFetchNextPageError: false,
  isFetchingNextPage: false,
  isLoading: false,
  loadedCount: 1,
  total: 2
};

const fetchNextPage = vi.fn(() => {
  queryState.data = {
    items: [orderOne, orderTwo],
    page: 1,
    page_size: 50,
    total: 2
  };
  queryState.hasNextPage = false;
  queryState.loadedCount = 2;
  queryState.total = 2;
});

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  constructor(private callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  trigger(isIntersecting = true) {
    this.callback(
      [
        {
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          target: document.createElement("div")
        } as IntersectionObserverEntry
      ],
      this as unknown as IntersectionObserver
    );
  }
}

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: typeof authUser | null }) => unknown) =>
    selector({ user: authUser })
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  orderDetailQueryKey: (orderId: number) => ["orders", "detail", orderId],
  useOrderDetailQuery: () => ({ data: null, isError: false, isLoading: false }),
  useOrderListSummaryQuery: (filters: Record<string, unknown>) => {
    summaryCalls.push(filters);
    return {
      data: summaryResult,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn()
    };
  },
  useOrdersInfiniteQuery: (filters: Record<string, unknown>) => {
    pageCalls.push(filters);
    return {
      ...queryState,
      items: queryState.data.items,
      fetchNextPage,
      refetch: vi.fn()
    };
  }
}));

vi.mock("@/features/orders/ui/orders-list", () => ({
  OrdersList: ({ onOpenOrder, orders }: { onOpenOrder: (orderId: number) => void; orders: Array<{ client_full_name: string; id: number }> }) => (
    <div data-testid="orders-list">
      {orders.map((order) => (
        <button key={order.id} type="button" onClick={() => onOpenOrder(order.id)}>
          {order.client_full_name}
        </button>
      ))}
    </div>
  ),
  OrdersListSkeleton: () => null
}));

vi.mock("@/features/orders/ui/order-detail-panel", () => ({
  OrderDetailPanel: ({ onClose, orderKey }: { onClose: () => void; orderKey: string }) => (
    <aside>
      <button type="button" onClick={onClose} aria-label="Закрыть заказ">
        close
      </button>
      <span>{orderKey}</span>
    </aside>
  )
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useOrderStatusesQuery: () => ({
    data: orderStatusesData,
    isLoading: false
  }),
  useUpdateUserPreferencesMutation: () => ({ isError: false, isPending: false, mutate: vi.fn() }),
  useUserPreferencesQuery: () => ({ data: userPreferencesData, isLoading: false })
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/shared/hooks/use-order-detail-version", () => ({
  useOrderDetailVersion: () => ({ version: "modern" })
}));

vi.mock("@/shared/hooks/use-orders-view-mode", () => ({
  useOrdersViewMode: () => ({ mode: "rows" })
}));

vi.mock("@/features/orders/model/order-sorting", () => ({
  DEFAULT_ORDER_SORTS: [],
  normalizeOrderSortDescriptors: (value: unknown) => value,
  toggleOrderSort: () => []
}));

import { OrdersPage } from "@/pages/orders-page";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

function mount(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    rerender(nextUi: React.ReactElement) {
      act(() => {
        root.render(nextUi);
      });
    },
    root,
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

function getLocationSearch(container: HTMLElement) {
  return container.querySelector('[data-testid="location-search"]')?.textContent ?? "";
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

describe("orders page infinite scroll contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    pageCalls.length = 0;
    summaryCalls.length = 0;
    authUser.permissions = [];
    queryState.data = {
      items: [orderOne],
      page: 1,
      page_size: 50,
      total: 2
    };
    queryState.hasNextPage = true;
    queryState.isFetchNextPageError = false;
    queryState.isFetchingNextPage = false;
    queryState.isLoading = false;
    queryState.loadedCount = 1;
    queryState.total = 2;
    fetchNextPage.mockClear();
    MockIntersectionObserver.instances.length = 0;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as unknown as typeof IntersectionObserver);
  });

  it("loads pages incrementally, appends items, and opens the sideboard without visible page controls", async () => {
    const { container, rerender, unmount } = mount(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/orders"]}>
          <LocationProbe />
          <OrdersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(pageCalls.at(-1)).toMatchObject({
      archivedScope: "active",
      pageSize: 50,
      search: "",
      status: []
    });
    expect(summaryCalls.at(-1)).toMatchObject({
      archivedScope: "active",
      search: ""
    });
    expect(container.textContent).not.toContain("Страница 1 из");
    expect(container.textContent).toContain("Показано 1 из 2");

    MockIntersectionObserver.instances.at(-1)?.trigger(true);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/orders"]}>
          <LocationProbe />
          <OrdersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(container.textContent).toContain("Demo Customer 03");
    expect(container.textContent).toContain("Demo Customer 11");
    expect(container.textContent).toContain("Все записи загружены");

    const searchInput = container.querySelector("input") as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.querySelector('[data-testid="orders-toolbar-primary-row"]')?.className).toContain("lg:flex-row");
    expect(container.querySelector('[data-testid="orders-toolbar-search"]')?.className).toContain("lg:flex-1");
    expect(container.querySelector('[data-testid="orders-toolbar-search"]')?.className).not.toContain("max-w-");
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Фильтры и сортировка"))?.className).toContain("lg:shrink-0");

    await act(async () => {
      setInputValue(searchInput as HTMLInputElement, "Ivan");
      await Promise.resolve();
    });

    expect(pageCalls.at(-1)).toMatchObject({
      archivedScope: "active",
      pageSize: 50,
      search: "Ivan",
      status: []
    });

    const openButtons = Array.from(container.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("Demo Customer 03")
    );
    expect(openButtons.length).toBeGreaterThan(0);

    act(() => {
      openButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(getLocationSearch(container)).toContain("order=1");
    expect(container.querySelector("aside")?.textContent).toContain("1");

    unmount();
    vi.unstubAllGlobals();
  });

  it("hides the new order action when the user lacks orders.create", () => {
    authUser.permissions = [];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/orders"]}>
            <LocationProbe />
            <OrdersPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(container.textContent).not.toContain("Новый заказ");

    act(() => root.unmount());
    container.remove();
  });
});
