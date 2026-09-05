import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/entities/order/model/types";
import type { VehicleDetail } from "@/entities/vehicle/model/types";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";

const createOrderMutation = vi.fn().mockResolvedValue(undefined);
const updateOrderMutation = vi.fn().mockResolvedValue(undefined);
const updateOrderStatusMutation = vi.fn().mockResolvedValue(undefined);
const createReminderMutation = vi.fn().mockResolvedValue(undefined);
const deleteReminderMutation = vi.fn().mockResolvedValue(undefined);
const doneReminderMutation = vi.fn().mockResolvedValue(undefined);
const upsertFieldValuesMutation = vi.fn().mockResolvedValue(undefined);

let currentOrder: Order | null = null;
let currentVehicleDetail: VehicleDetail | null = null;
const currentClients = new Map<number, Record<string, unknown>>();
let currentModules = { photos: false, customer_payer: true };
let lastOpenedVehicleKey: string | null = null;
let lastOpenedClientKey: string | null = null;
let currentVehiclesList: VehicleDetail[] | null = null;
let latestClientPanelProps: { onCreated: (clientId: number) => void } | null = null;
let latestVehiclePanelProps: { clientPresetId?: number | null; onCreated: (vehicleId: number) => void } | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
  currentOrder = null;
  currentVehicleDetail = null;
  currentClients.clear();
  currentModules = { photos: false, customer_payer: true };
  lastOpenedVehicleKey = null;
  lastOpenedClientKey = null;
  currentVehiclesList = null;
  latestClientPanelProps = null;
  latestVehiclePanelProps = null;
  createOrderMutation.mockClear();
  updateOrderMutation.mockClear();
  updateOrderStatusMutation.mockClear();
  createReminderMutation.mockClear();
  deleteReminderMutation.mockClear();
  doneReminderMutation.mockClear();
  upsertFieldValuesMutation.mockClear();
});

function registerClient(client: Record<string, unknown>) {
  currentClients.set(client.id as number, client);
}

function findSelectInputByLabel(container: HTMLElement, label: string) {
  const labelEl = Array.from(container.querySelectorAll("div.text-sm.font-medium.text-foreground")).find(
    (node) => node.textContent === label
  );
  const fieldWrapper = labelEl?.parentElement ?? null;
  return (fieldWrapper?.querySelector("input") ?? null) as HTMLInputElement | null;
}

function findCardInputByUppercaseLabel(container: HTMLElement, label: string) {
  const labelEl = Array.from(container.querySelectorAll("div")).find(
    (node) => node.textContent === label && node.className.includes("uppercase")
  );
  let ancestor: HTMLElement | null = labelEl ?? null;
  for (let i = 0; i < 5 && ancestor; i += 1) {
    const input = ancestor.querySelector("input");
    if (input) {
      return input as HTMLInputElement;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    amount_to_pay: "1200.00",
    balance_due: "1200.00",
    client_id: 1,
    client_summary: {
      full_name: "ООО Ромашка",
      id: 1,
      phone_display: "+7 (000) 000-00-43"
    },
    comment: null,
    completed_at: null,
    due_date: null,
    discount_type: "fixed",
    discount_value: "0.00",
    handover_at: null,
    id: 42,
    is_archived: false,
    paid_total: "0.00",
    payment_status: "unpaid",
    payments: [],
    services: [],
    services_total: "1200.00",
    status: "new",
    status_color: "#6b7280",
    status_display_name: "Новый",
    status_group: "new",
    status_history: [],
    vehicle_id: 7,
    vehicle_summary: {
      brand: "Toyota",
      client_id: 1,
      display_name: "A123BC · Toyota Camry",
      id: 7,
      model: "Camry",
      plate_number_display: "A123BC",
      vin: "VIN123"
    },
    ...overrides
  };
}


vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { id: number; permissions: string[]; role_code: string } | null }) => unknown) =>
    selector({
      user: {
        id: 1,
        permissions: ["clients.view", "orders.create", "orders.edit", "vehicles.edit", "vehicles.view"],
        role_code: "standard_user"
      }
    })
}));

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useClientDetailQuery: (clientId: number | null) => ({
    data: clientId ? currentClients.get(clientId) ?? null : null,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useClientsListQuery: () => ({
    data: Array.from(currentClients.values()),
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn()
  })
}));

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useVehicleDetailQuery: (vehicleId: number | null) => ({
    data: vehicleId ? (currentVehiclesList ?? []).find((vehicle) => vehicle.id === vehicleId) ?? (currentVehicleDetail?.id === vehicleId ? currentVehicleDetail : null) : null,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useVehiclesListQuery: () => ({
    data: currentVehiclesList ?? (currentVehicleDetail ? [currentVehicleDetail] : []),
    isError: false,
    isFetching: false,
    isLoading: false,
    isPending: false,
    refetch: vi.fn()
  })
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useCreateOrderMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: createOrderMutation }),
  useOrderDetailQuery: () => ({
    data: currentOrder,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useUpdateOrderMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: updateOrderMutation }),
  useUpdateOrderStatusMutation: () => ({ isPending: false, mutateAsync: updateOrderStatusMutation })
}));

vi.mock("@/features/documents/ui/order-documents-section", () => ({ OrderDocumentsSection: () => null }));
vi.mock("@/features/inspection/ui/inspection-order-section", () => ({ InspectionOrderSection: () => null }));
vi.mock("@/features/orders/ui/order-payments-section", () => ({ OrderPaymentsSection: () => null }));
vi.mock("@/features/orders/ui/order-photo-section", () => ({ OrderPhotoSection: () => null }));
vi.mock("@/features/vehicles/ui/vehicle-detail-panel", () => ({
  VehicleDetailPanel: ({ clientPresetId, onCreated, vehicleKey }: { clientPresetId?: number | null; onCreated: (vehicleId: number) => void; vehicleKey: string | null }) => {
    lastOpenedVehicleKey = vehicleKey;
    latestVehiclePanelProps = { clientPresetId, onCreated };
    return null;
  }
}));
vi.mock("@/features/clients/ui/client-detail-panel", () => ({
  ClientDetailPanel: ({ clientKey, onCreated }: { clientKey: string | null; onCreated: (clientId: number) => void }) => {
    lastOpenedClientKey = clientKey;
    latestClientPanelProps = { onCreated };
    return null;
  }
}));

vi.mock("@/features/notifications/api/notifications-hooks", () => ({
  useCreateOrderReminderMutation: () => ({ isPending: false, mutateAsync: createReminderMutation }),
  useDeleteReminderMutation: () => ({ isPending: false, mutateAsync: deleteReminderMutation }),
  useMarkReminderDoneMutation: () => ({ isPending: false, mutateAsync: doneReminderMutation }),
  useOrderRemindersQuery: () => ({ data: [], isError: false, isLoading: false, refetch: vi.fn() })
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [], isLoading: false }),
  useServicesListQuery: () => ({ data: [], isLoading: false })
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useCustomFieldDefsQuery: () => ({ data: [], isLoading: false }),
  useModulesQuery: () => ({ data: currentModules, isLoading: false }),
  useOrderFieldValuesQuery: () => ({ data: [], isLoading: false }),
  useOrderStatusesQuery: () => ({
    data: [
      {
        code: "new",
        color: "#6b7280",
        display_name: "Новый",
        is_default: true,
        sort_order: 10,
        status_group: "new"
      }
    ],
    isLoading: false
  }),
  useUpsertOrderFieldValuesMutation: () => ({ isPending: false, mutateAsync: upsertFieldValuesMutation })
}));

vi.mock("@/shared/hooks/use-overlay-mode", () => ({ useOverlayMode: () => undefined }));
vi.mock("@/shared/hooks/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    dismissWarning: vi.fn(),
    isWarningVisible: false,
    requestClose: vi.fn()
  })
}));
vi.mock("@/shared/ui/mobile-sheet", () => ({ MobileSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/shared/ui/loading-state", () => ({ LoadingState: () => <div /> }));
vi.mock("@/shared/ui/error-state", () => ({ ErrorState: () => <div /> }));
vi.mock("@/shared/ui/unsaved-changes-banner", () => ({ UnsavedChangesBanner: () => null }));

describe("order customer and payer ui", () => {
  it("creates a vehicle for a just-created customer and keeps both ids in the new order", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="new" />);
      await Promise.resolve();
    });

    await act(async () => {
      latestClientPanelProps?.onCreated(23);
      await Promise.resolve();
    });

    expect(lastOpenedVehicleKey).toBe("new");
    expect(latestVehiclePanelProps?.clientPresetId).toBe(23);

    await act(async () => {
      latestVehiclePanelProps?.onCreated(37);
      await Promise.resolve();
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Создать заказ");
    expect(submitButton).toBeTruthy();

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(createOrderMutation).toHaveBeenCalledWith(expect.objectContaining({ client_id: 23, vehicle_id: 37 }));

    act(() => {
      root.unmount();
    });
  });

  it("shows legal client labels and treats a null payer as the customer", async () => {
    registerClient({
      client_type: "legal",
      company_name: "ООО Ромашка",
      display_label: "ООО Ромашка",
      full_name: "Тестовый Клиент 02",
      id: 1,
      phone_display: "+7 (000) 000-00-43"
    });
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "ООО Ромашка",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentOrder = baseOrder({ payer_client_id: null });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("ООО Ромашка");
    expect(container.textContent).toContain("Совпадает с заказчиком");

    act(() => {
      root.unmount();
    });
  });

  it("hides the customer and payer controls when the module is disabled", async () => {
    currentModules = { photos: false, customer_payer: false };
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "Demo Customer 27",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentOrder = baseOrder({ payer_client_id: null });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("Заказчик отличается от владельца автомобиля");
    expect(container.textContent).not.toContain("Плательщик отличается от заказчика");
    expect(container.textContent).not.toContain("Клиент-заказчик");
    expect(container.textContent).not.toContain("Клиент-плательщик");

    act(() => {
      root.unmount();
    });
  });

  it("has no edit-pencil button for the vehicle owner and never navigates to the vehicle card to change it", async () => {
    currentOrder = baseOrder();
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "Тестовый Клиент 07",
      current_owner_phone_display: "+7 (000) 000-00-44",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    const ownerEditButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "Изменить владельца"
    );
    expect(ownerEditButton).toBeUndefined();

    const ownerLinkButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "Перейти к владельцу"
    );
    expect(ownerLinkButton).not.toBeUndefined();

    await act(async () => {
      ownerLinkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(lastOpenedClientKey).toBe("1");
    expect(lastOpenedVehicleKey).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("has no edit-pencil button for the vehicle and shows the vehicle dropdown directly", async () => {
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "ООО Ромашка",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentOrder = baseOrder();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(
      Array.from(container.querySelectorAll("button")).some((button) => button.getAttribute("aria-label") === "Изменить автомобиль")
    ).toBe(false);

    const vehicleInput = findCardInputByUppercaseLabel(container, "Автомобиль");
    expect(vehicleInput).not.toBeNull();
    expect(vehicleInput?.value).toContain("A123BC");

    act(() => {
      root.unmount();
    });
  });

  it("filters the vehicle dropdown to the selected owner's fleet when the payer module is enabled", async () => {
    registerClient({
      client_type: "legal",
      company_name: "ООО Ромашка",
      display_label: "ООО Ромашка",
      full_name: "Тестовый Клиент 02",
      id: 1,
      phone_display: "+7 (000) 000-00-43"
    });
    registerClient({
      client_type: "individual",
      display_label: "Тестовый Клиент 08",
      full_name: "Тестовый Клиент 08",
      id: 9,
      phone_display: "+7 (000) 000-00-45"
    });
    const ownVehicle: VehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "ООО Ромашка",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    const otherOwnerVehicle: VehicleDetail = {
      ...ownVehicle,
      client_id: 9,
      current_owner_full_name: "Тестовый Клиент 08",
      current_owner_phone_display: "+7 (000) 000-00-45",
      id: 8,
      plate_number_display: "B456DE",
      plate_number_normalized: "B456DE"
    };
    currentVehicleDetail = ownVehicle;
    currentVehiclesList = [ownVehicle, otherOwnerVehicle];
    currentOrder = baseOrder();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    const vehicleInput = findCardInputByUppercaseLabel(container, "Автомобиль");
    expect(vehicleInput).not.toBeNull();

    await act(async () => {
      vehicleInput?.focus();
    });

    // Until a different owner is picked, the vehicle list stays scoped to the current owner's fleet.
    expect(Array.from(document.body.querySelectorAll("button")).some((button) => button.textContent?.includes("B456DE"))).toBe(false);

    const ownerInput = findCardInputByUppercaseLabel(container, "Владелец автомобиля");
    expect(ownerInput).not.toBeNull();

    await act(async () => {
      ownerInput?.focus();
    });

    const otherOwnerOption = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Тестовый Клиент 08")
    );
    expect(otherOwnerOption).not.toBeUndefined();

    await act(async () => {
      otherOwnerOption?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    // Picking a different owner clears the now-mismatched vehicle selection.
    expect(vehicleInput?.value).toBe("");

    await act(async () => {
      vehicleInput?.blur();
    });
    await act(async () => {
      vehicleInput?.focus();
    });

    // The vehicle list now narrows down to the newly selected owner's fleet.
    const ownVehicleOption = Array.from(document.body.querySelectorAll("button")).some((button) =>
      button.textContent?.includes("A123BC")
    );
    expect(ownVehicleOption).toBe(false);

    const otherVehicleOption = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("B456DE")
    );
    expect(otherVehicleOption).not.toBeUndefined();

    await act(async () => {
      otherVehicleOption?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(vehicleInput?.value).toContain("B456DE");

    act(() => {
      root.unmount();
    });
  });

  it("changes the order's customer directly via the dropdown when the payer module is disabled", async () => {
    currentModules = { photos: false, customer_payer: false };
    registerClient({
      client_type: "individual",
      display_label: "Тестовый Клиент 08",
      full_name: "Тестовый Клиент 08",
      id: 9,
      phone_display: "+7 (000) 000-00-45"
    });
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "ООО Ромашка",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentOrder = baseOrder();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(
      Array.from(container.querySelectorAll("button")).some((button) => button.getAttribute("aria-label") === "Изменить заказчика")
    ).toBe(false);

    const clientInput = findSelectInputByLabel(container, "Клиент");
    expect(clientInput).not.toBeNull();

    await act(async () => {
      clientInput?.focus();
    });

    const option = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Тестовый Клиент 08"));
    expect(option).not.toBeUndefined();

    await act(async () => {
      option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Тестовый Клиент 08");

    act(() => {
      root.unmount();
    });
  });

  it("changes the customer via the dropdown when the payer module is enabled, without navigating away", async () => {
    registerClient({
      client_type: "individual",
      display_label: "Тестовый Клиент 08",
      full_name: "Тестовый Клиент 08",
      id: 9,
      phone_display: "+7 (000) 000-00-45"
    });
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "ООО Ромашка",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentOrder = baseOrder();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(
      Array.from(container.querySelectorAll("button")).some((button) => button.getAttribute("aria-label") === "Изменить заказчика")
    ).toBe(false);

    const toggleLabels = Array.from(container.querySelectorAll("label")).filter((label) =>
      label.textContent?.includes("Заказчик отличается от владельца автомобиля")
    );
    const customerSwitch = toggleLabels[0]?.querySelector('button[role="switch"]');
    expect(customerSwitch).not.toBeNull();

    await act(async () => {
      customerSwitch?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const customerInput = findSelectInputByLabel(container, "Клиент-заказчик");
    expect(customerInput).not.toBeNull();

    await act(async () => {
      customerInput?.focus();
    });

    const option = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("Тестовый Клиент 08"));
    expect(option).not.toBeUndefined();

    await act(async () => {
      option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Тестовый Клиент 08");
    expect(lastOpenedVehicleKey).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows the payer selector when the payer differs checkbox is enabled", async () => {
    currentOrder = null;
    currentVehicleDetail = {
      brand: "Toyota",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "ООО Ромашка",
      current_owner_phone_display: "+7 (000) 000-00-43",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    registerClient({
      client_type: "individual",
      display_label: "Тестовый Клиент 02",
      full_name: "Тестовый Клиент 02",
      id: 2,
      phone_display: "+7 (000) 000-00-46"
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="new" />);
      await Promise.resolve();
    });

    const toggleLabels = Array.from(container.querySelectorAll("label")).filter((label) =>
      label.textContent?.includes("Плательщик отличается от заказчика")
    );
    expect(toggleLabels.length).toBeGreaterThan(0);

    const payerSwitch = toggleLabels[0]?.querySelector('button[role="switch"]');
    expect(payerSwitch).not.toBeNull();

    await act(async () => {
      payerSwitch?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Клиент-плательщик");
    expect(container.querySelector('input[placeholder="Выберите плательщика"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not crash when old order data has no payer_client_id field", async () => {
    registerClient({
      client_type: "individual",
      display_label: "Тестовый Клиент 02",
      full_name: "Тестовый Клиент 02",
      id: 1,
      phone_display: "+7 (000) 000-00-47"
    });
    currentVehicleDetail = {
      brand: "Lada",
      brand_id: null,
      client_id: 1,
      color: null,
      comment: null,
      current_owner_full_name: "Тестовый Клиент 02",
      current_owner_phone_display: "+7 (000) 000-00-47",
      deleted_at: null,
      id: 7,
      is_deleted: false,
      mileage: null,
      model: "Vesta",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A777AA00",
      plate_number_normalized: "A777AA00",
      vin: "VIN777",
      year: null
    };
    currentOrder = baseOrder();
    delete (currentOrder as Record<string, unknown>).payer_client_id;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Тестовый Клиент 02");
    expect(container.textContent).toContain("Совпадает с заказчиком");

    act(() => {
      root.unmount();
    });
  });
});
