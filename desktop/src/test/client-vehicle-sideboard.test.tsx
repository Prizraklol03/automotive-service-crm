import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const clients = [
    {
      comment: null,
      deleted_at: null,
      full_name: "Demo Customer 03",
      id: 1,
      is_deleted: false,
      phone_display: "+7 (000) 000-00-01",
      phone_normalized: "+70000000001",
      telegram_username: null
    },
    {
      comment: null,
      deleted_at: null,
      full_name: "Demo Customer 11",
      id: 2,
      is_deleted: false,
      phone_display: "+7 (000) 000-00-02",
      phone_normalized: "+70000000002",
      telegram_username: null
    }
  ];

  const clientOrders = {
    1: [
      {
        amount_to_pay: "1500.00",
        balance_due: "1500.00",
        category_colors: [],
        client_full_name: "Demo Customer 03",
        client_id: 1,
        client_phone: "+70000000001",
        comment: "First order",
        completed_at: "2026-05-01T10:00:00",
        discount_type: "fixed",
        discount_value: "0.00",
        due_date: null,
        handover_at: null,
        id: 10,
        is_archived: false,
        paid_total: "0.00",
        payment_status: "unpaid",
        primary_category_color: null,
        primary_category_name: null,
        scheduled_for: null,
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
      }
    ],
    2: [
      {
        amount_to_pay: "2000.00",
        balance_due: "0.00",
        category_colors: [],
        client_full_name: "Demo Customer 11",
        client_id: 2,
        client_phone: "+70000000002",
        comment: "Second order",
        completed_at: "2026-05-02T11:00:00",
        discount_type: "fixed",
        discount_value: "0.00",
        due_date: null,
        handover_at: null,
        id: 11,
        is_archived: false,
        paid_total: "2000.00",
        payment_status: "paid",
        primary_category_color: null,
        primary_category_name: null,
        scheduled_for: null,
        service_names: ["Polish"],
        services_total: "2000.00",
        status: "closed",
        status_color: "#0f766e",
        status_display_name: "Выдан",
        status_group: "closed",
        status_changed_at: null,
        vehicle_brand: "Lada",
        vehicle_id: 3,
        vehicle_model: "Niva",
        vehicle_plate_number: "B888BB00",
        vehicle_vin: null
      }
    ]
  };

  const clientDetails = {
    1: {
      ...clients[0],
      orders: clientOrders[1]
    },
    2: {
      ...clients[1],
      orders: clientOrders[2]
    }
  };

  const clientInfiniteFilters: Array<{ pageSize: number; search: string }> = [];
  const clientListQueryCalls: Array<{ search: string; enabled?: boolean }> = [];
  const vehicleInfiniteFilters: Array<{ pageSize: number; search: string }> = [];

  const vehicles = [
    {
      brand: "Lada",
      brand_id: null,
      client_id: 1,
      color: "BLACK",
      comment: null,
      deleted_at: null,
      id: 2,
      is_deleted: false,
      mileage: 10000,
      model: "Vesta",
      model_id: null,
      plate_number_display: "A777AA00",
      plate_number_normalized: "A777AA00",
      vin: null,
      year: 2022
    },
    {
      brand: "Lada",
      brand_id: null,
      client_id: 2,
      color: "WHITE",
      comment: null,
      deleted_at: null,
      id: 3,
      is_deleted: false,
      mileage: 12000,
      model: "Niva",
      model_id: null,
      plate_number_display: "B888BB00",
      plate_number_normalized: "B888BB00",
      vin: "XW1234567890",
      year: 2023
    }
  ];

  const vehicleListState = {
    data: vehicles,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  };

  const vehicleDetails = {
    2: {
      brand: "Lada",
      brand_id: null,
      client_id: 1,
      color: "BLACK",
      comment: null,
      current_owner_full_name: "Demo Customer 03",
      current_owner_phone_display: "+7 (000) 000-00-01",
      deleted_at: null,
      id: 2,
      is_deleted: false,
      mileage: 10000,
      model: "Vesta",
      model_id: null,
      orders: clientOrders[1],
      owner_history: [
        {
          client_full_name: "Demo Customer 03",
          client_id: 1,
          comment: null,
          id: 1,
          owned_from: "2026-01-10",
          owned_to: null,
          status: "current",
          title: "Новый владелец — Ivan Petrov"
        }
      ],
      plate_number_display: "A777AA00",
      plate_number_normalized: "A777AA00",
      vin: null,
      year: 2022
    },
    3: {
      brand: "Lada",
      brand_id: null,
      client_id: 2,
      color: "WHITE",
      comment: null,
      current_owner_full_name: "Demo Customer 11",
      current_owner_phone_display: "+7 (000) 000-00-02",
      deleted_at: null,
      id: 3,
      is_deleted: false,
      mileage: 12000,
      model: "Niva",
      model_id: null,
      orders: clientOrders[2],
      owner_history: [
        {
          client_full_name: "Demo Customer 11",
          client_id: 2,
          comment: null,
          id: 2,
          owned_from: "2026-05-02",
          owned_to: null,
          status: "current",
          title: "Новый владелец — Petr Ivanov"
        }
      ],
      plate_number_display: "B888BB00",
      plate_number_normalized: "B888BB00",
      vin: "XW1234567890",
      year: 2023
    }
  };

  const user = { full_name: "Demo Customer 01", id: 1, is_active: true, login: "admin", role_code: "admin" as const };

  return { clientDetails, clientInfiniteFilters, clientListQueryCalls, clientOrders, clients, user, vehicleDetails, vehicleInfiniteFilters, vehicleListState, vehicles };
});

const useAuthStoreMock = vi.hoisted(() => vi.fn((selector: (state: { user: typeof mocks.user }) => unknown) => selector({ user: mocks.user })));

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: useAuthStoreMock
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

vi.mock("@/shared/hooks/use-order-detail-version", () => ({
  useOrderDetailVersion: () => ({ version: "modern" })
}));

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useArchiveClientMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useClientDetailQuery: (clientId: number | null) => {
    return {
      data: clientId ? mocks.clientDetails[clientId as 1 | 2] ?? null : null,
      isError: false,
      isLoading: false,
      refetch: vi.fn()
    };
  },
  useClientOrdersQuery: (clientId: number | null) => ({
    data: { orders: clientId ? mocks.clientOrders[clientId as 1 | 2] ?? [] : [] },
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useCreateClientMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUpdateClientMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useClientsInfiniteQuery: (filters: { pageSize: number; search: string }) => {
    mocks.clientInfiniteFilters.push(filters);
    return {
      data: { items: mocks.clients, page: 1, page_size: filters.pageSize, total: mocks.clients.length },
      items: mocks.clients,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isLoading: false,
      loadedCount: mocks.clients.length,
      total: mocks.clients.length,
      refetch: vi.fn()
    };
  },
  useClientsListQuery: (search = "", enabled = true) => {
    mocks.clientListQueryCalls.push({ enabled, search });
    return { data: enabled ? mocks.clients : [], isLoading: false };
  },
  useVehiclesListQuery: () => mocks.vehicleListState
}));

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useArchiveVehicleMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCarBrandsQuery: () => ({ data: [] }),
  useCarModelsByBrandQuery: () => ({ data: [] }),
  useCreateVehicleMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useClientVehiclesQuery: () => mocks.vehicleListState,
  useUpdateVehicleMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useVehiclesInfiniteQuery: (filters: { pageSize: number; search: string }) => {
    mocks.vehicleInfiniteFilters.push(filters);
    return {
      data: { items: mocks.vehicles, page: 1, page_size: filters.pageSize, total: mocks.vehicles.length },
      items: mocks.vehicles,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isLoading: false,
      loadedCount: mocks.vehicles.length,
      total: mocks.vehicles.length,
      refetch: vi.fn()
    };
  },
  useVehicleDetailQuery: (vehicleId: number | null) => ({
    data: vehicleId ? mocks.vehicleDetails[vehicleId as 2 | 3] ?? null : null,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useVehiclesListQuery: () => ({ data: mocks.vehicles })
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useModulesQuery: () => ({ data: null, isLoading: false }),
  useUpdateModulesMutation: () => ({ isPending: false, mutate: vi.fn() })
}));

vi.mock("@/features/settings/ui/custom-fields-card", () => ({ CustomFieldsCard: () => <div /> }));
vi.mock("@/features/settings/ui/document-templates-card", () => ({ DocumentTemplatesCard: () => <div /> }));
vi.mock("@/features/settings/ui/order-sort-preferences-card", () => ({ OrderSortPreferencesCard: () => <div /> }));
vi.mock("@/features/settings/ui/status-table-card", () => ({ StatusTableCard: () => <div /> }));
vi.mock("@/features/settings/ui/visual-settings-card", () => ({ VisualSettingsCard: () => <div /> }));
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

import { ClientsPage } from "@/pages/clients-page";
import { SettingsPage } from "@/pages/settings-page";
import { VehiclesPage } from "@/pages/vehicles-page";

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
  return <div data-testid="location-search">{location.search}</div>;
}

function getButtonsByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes(text));
}

function clickButtonByText(container: HTMLElement, text: string, index = 0) {
  const button = getButtonsByText(container, text)[index];
  if (!button) {
    throw new Error(`Button "${text}" not found`);
  }

  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function clickButtonByLabel(container: HTMLElement, ariaLabel: string) {
  const button = container.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null;
  if (!button) {
    throw new Error(`Button with aria-label "${ariaLabel}" not found`);
  }

  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function hasExactText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("*")).some((node) => node.textContent === text);
}

function getLocationSearch(container: HTMLElement) {
  return container.querySelector('[data-testid="location-search"]')?.textContent ?? "";
}

function setInputValue(container: HTMLElement, name: string, value: string) {
  const input = container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`Input "${name}" not found`);
  }

  act(() => {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
}

function getInputValues(container: HTMLElement) {
  return Array.from(container.querySelectorAll("input")).map((input) => (input as HTMLInputElement).value);
}

describe("client and vehicle sideboards", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.clientInfiniteFilters.length = 0;
    mocks.clientListQueryCalls.length = 0;
    mocks.vehicleInfiniteFilters.length = 0;
    mocks.vehicleListState.data = mocks.vehicles;
    mocks.vehicleListState.isLoading = false;
    mocks.vehicleListState.isError = false;
  });

  it("shows the display mode settings and persists client and vehicle preferences", () => {
    const { container, unmount } = mount(<SettingsPage />);

    expect(hasExactText(container, "Отображение клиентов")).toBe(true);
    expect(hasExactText(container, "Отображение автомобилей")).toBe(true);

    clickButtonByText(container, "Карточками", 1);
    clickButtonByText(container, "Карточками", 2);

    expect(localStorage.getItem("crm.pref.clientsViewMode:1")).toBe("cards");
    expect(localStorage.getItem("crm.pref.clientsViewMode.version:1")).toBe("2026-05-14");
    expect(localStorage.getItem("crm.pref.vehiclesViewMode:1")).toBe("cards");
    expect(localStorage.getItem("crm.pref.vehiclesViewMode.version:1")).toBe("2026-05-14");

    unmount();
  });

  it("opens the client sideboard from rows and cards layouts and keeps the footer docked", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/clients"]}>
        <LocationProbe />
        <ClientsPage />
      </MemoryRouter>
    );

    expect(mocks.clientInfiniteFilters.at(-1)).toEqual({
      pageSize: 50,
      search: ""
    });
    expect(hasExactText(container, "Telegram")).toBe(true);
    expect(container.textContent ?? "").not.toContain("Страница 1 из");

    clickButtonByText(container, "Demo Customer 03");

    expect(getLocationSearch(container)).toBe("?client=1");
    expect(container.querySelector("aside")?.className ?? "").toContain("fixed inset-y-0 right-0");
    expect(hasExactText(container, "Связанные автомобили")).toBe(true);
    expect(hasExactText(container, "История заказов")).toBe(true);
    expect(container.innerHTML).toContain("mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5");
    expect(container.innerHTML).not.toContain("sticky bottom-0 z-[1] bg-background/95 backdrop-blur");

    clickButtonByLabel(container, "Закрыть клиента");
    expect(getLocationSearch(container)).toBe("");

    clickButtonByText(container, "Demo Customer 11");
    expect(getLocationSearch(container)).toBe("?client=2");
    expect(hasExactText(container, "Second order")).toBe(true);

    unmount();

    localStorage.setItem("crm.pref.clientsViewMode:1", "cards");
    localStorage.setItem("crm.pref.clientsViewMode.version:1", "2026-05-14");

    const cards = mount(
      <MemoryRouter initialEntries={["/clients"]}>
        <LocationProbe />
        <ClientsPage />
      </MemoryRouter>
    );

    expect(hasExactText(cards.container, "Telegram")).toBe(false);

    clickButtonByText(cards.container, "Demo Customer 03");
    expect(getLocationSearch(cards.container)).toBe("?client=1");
    expect(hasExactText(cards.container, "Связанные автомобили")).toBe(true);
    expect(hasExactText(cards.container, "История заказов")).toBe(true);
    expect(cards.container.querySelector("aside")?.className ?? "").toContain("fixed inset-y-0 right-0");
    clickButtonByLabel(cards.container, "Закрыть клиента");
    expect(getLocationSearch(cards.container)).toBe("");

    cards.unmount();
  });

  it("opens the order sideboard from client history on top of the client panel", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/clients"]}>
        <LocationProbe />
        <ClientsPage />
      </MemoryRouter>
    );

    clickButtonByText(container, "Demo Customer 03");
    clickButtonByText(container, "Заказ #10");

    expect(getLocationSearch(container)).toBe("?client=1&order=10");
    expect(container.querySelector('[data-testid="order-sideboard"]')?.getAttribute("data-desktop-mode")).toBe("docked");

    clickButtonByText(container, "Close order");
    expect(getLocationSearch(container)).toBe("?client=1");
    expect(hasExactText(container, "История заказов")).toBe(true);

    unmount();
  });

  it("opens the vehicle sideboard from rows and cards layouts and keeps owner blocks visible", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/vehicles"]}>
        <LocationProbe />
        <VehiclesPage />
      </MemoryRouter>
    );

    expect(mocks.vehicleInfiniteFilters.at(-1)).toEqual({
      pageSize: 50,
      search: ""
    });
    expect(hasExactText(container, "VIN")).toBe(true);
    expect(container.textContent ?? "").not.toContain("Страница 1 из");

    clickButtonByText(container, "A777AA00");

    expect(getLocationSearch(container)).toBe("?vehicle=2");
    expect(container.querySelector("aside")?.className ?? "").toContain("fixed inset-y-0 right-0");
    expect(hasExactText(container, "История владельцев")).toBe(true);
    expect(getInputValues(container).some((value) => value.includes("Demo Customer 03") || value.includes("+7 (000) 000-00-01"))).toBe(true);
    expect(container.innerHTML).toContain("mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5");
    expect(container.innerHTML).not.toContain("sticky bottom-0 z-[1] bg-background/95 backdrop-blur");

    clickButtonByLabel(container, "Закрыть автомобиль");
    expect(getLocationSearch(container)).toBe("");

    clickButtonByText(container, "B888BB00");
    expect(getLocationSearch(container)).toBe("?vehicle=3");
    expect(hasExactText(container, "Demo Customer 11")).toBe(true);
    expect(hasExactText(container, "Выберите клиента")).toBe(false);

    unmount();

    localStorage.setItem("crm.pref.vehiclesViewMode:1", "cards");
    localStorage.setItem("crm.pref.vehiclesViewMode.version:1", "2026-05-14");

    const cards = mount(
      <MemoryRouter initialEntries={["/vehicles"]}>
        <LocationProbe />
        <VehiclesPage />
      </MemoryRouter>
    );

    expect(hasExactText(cards.container, "VIN")).toBe(false);

    clickButtonByText(cards.container, "A777AA00");
    expect(getLocationSearch(cards.container)).toBe("?vehicle=2");
    expect(hasExactText(cards.container, "История владельцев")).toBe(true);
    expect(cards.container.querySelector("aside")?.className ?? "").toContain("fixed inset-y-0 right-0");
    expect(getInputValues(cards.container).some((value) => value.includes("Demo Customer 03") || value.includes("+7 (000) 000-00-01"))).toBe(true);
    clickButtonByLabel(cards.container, "Закрыть автомобиль");
    expect(getLocationSearch(cards.container)).toBe("");

    clickButtonByText(cards.container, "A777AA00");
    setInputValue(cards.container, "plate_number", "A779AA00");
    clickButtonByLabel(cards.container, "Закрыть автомобиль");
    expect(getLocationSearch(cards.container)).toBe("?vehicle=2");
    expect(cards.container.textContent ?? "").toContain("Есть несохранённые изменения");
    clickButtonByText(cards.container, "Закрыть без сохранения");
    expect(getLocationSearch(cards.container)).toBe("");

    cards.unmount();
  });

  it("loads client options when opening the new vehicle sideboard", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/vehicles?vehicle=new"]}>
        <LocationProbe />
        <VehiclesPage />
      </MemoryRouter>
    );

    expect(getLocationSearch(container)).toBe("?vehicle=new");
    expect(mocks.clientListQueryCalls.some((call) => call.search === "" && call.enabled === true)).toBe(true);
    expect(hasExactText(container, "Клиент")).toBe(true);
    expect((container.textContent ?? "").includes("Новый автомобиль")).toBe(true);

    unmount();
  });

  it("opens the order sideboard from vehicle history on top of the vehicle panel", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/vehicles"]}>
        <LocationProbe />
        <VehiclesPage />
      </MemoryRouter>
    );

    clickButtonByText(container, "A777AA00");
    clickButtonByText(container, "Заказ #10");

    expect(getLocationSearch(container)).toBe("?vehicle=2&order=10");
    expect(container.querySelector('[data-testid="order-sideboard"]')?.getAttribute("data-desktop-mode")).toBe("docked");

    clickButtonByText(container, "Close order");
    expect(getLocationSearch(container)).toBe("?vehicle=2");
    expect(hasExactText(container, "История владельцев")).toBe(true);

    unmount();
  });
});
