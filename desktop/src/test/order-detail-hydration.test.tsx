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
let currentVehiclesLoading = true;
let currentVehicles: Array<{
  brand: string | null;
  client_id: number;
  id: number;
  model: string | null;
  plate_number_display: string;
}> = [];

beforeEach(() => {
  document.body.innerHTML = "";
  currentOrder = null;
  currentVehicleDetail = null;
  currentVehiclesLoading = true;
  currentVehicles = [];
  createOrderMutation.mockClear();
  updateOrderMutation.mockClear();
  updateOrderStatusMutation.mockClear();
  createReminderMutation.mockClear();
  deleteReminderMutation.mockClear();
  doneReminderMutation.mockClear();
  upsertFieldValuesMutation.mockClear();
});


vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useClientDetailQuery: (clientId: number | null) => ({
    data: currentOrder && clientId === currentOrder.client_id
      ? {
          full_name: "Тестовый Клиент 02",
          id: currentOrder.client_id,
          phone_display: "+7 (000) 000-00-47"
        }
      : null,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useClientsListQuery: () => ({
    data: [
      {
        full_name: "Тестовый Клиент 02",
        id: 1,
        phone_display: "+7 (000) 000-00-47"
      }
    ],
    isLoading: false
  })
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
    useNavigate: () => vi.fn()
  };
});

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useVehicleDetailQuery: () => ({ data: null, isError: false, isLoading: false, refetch: vi.fn() }),
  useVehiclesListQuery: () => ({
    data: currentVehiclesLoading ? [] : currentVehicles,
    isLoading: currentVehiclesLoading,
    isPending: currentVehiclesLoading
  }),
  useArchiveVehicleMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCarBrandsQuery: () => ({ data: [], isLoading: false }),
  useCarModelsByBrandQuery: () => ({ data: [], isLoading: false }),
  useCreateVehicleMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateVehicleMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useCreateOrderMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: createOrderMutation }),
  useOrderDetailQuery: () => ({
    data: currentOrder,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useOrderRelatedQueries: () => ({
    clientQuery: {
      data: currentOrder
        ? {
            full_name: "Тестовый Клиент 02",
            id: currentOrder.client_id,
            phone_display: "+7 (000) 000-00-47"
          }
        : null
    },
    vehicleQuery: {
      data: currentVehicleDetail,
      isPending: false
    }
  }),
  useUpdateOrderMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: updateOrderMutation }),
  useUpdateOrderStatusMutation: () => ({ isPending: false, mutateAsync: updateOrderStatusMutation })
}));

vi.mock("@/features/documents/ui/order-documents-section", () => ({
  OrderDocumentsSection: () => null
}));

vi.mock("@/features/clients/ui/client-detail-panel", () => ({
  ClientDetailPanel: () => null
}));

vi.mock("@/features/inspection/ui/inspection-order-section", () => ({
  InspectionOrderSection: () => null
}));

vi.mock("@/features/notifications/api/notifications-hooks", () => ({
  useCreateOrderReminderMutation: () => ({ isPending: false, mutateAsync: createReminderMutation }),
  useDeleteReminderMutation: () => ({ isPending: false, mutateAsync: deleteReminderMutation }),
  useMarkReminderDoneMutation: () => ({ isPending: false, mutateAsync: doneReminderMutation }),
  useOrderRemindersQuery: () => ({ data: [], isError: false, isLoading: false, refetch: vi.fn() })
}));

vi.mock("@/features/orders/ui/order-payments-section", () => ({
  OrderPaymentsSection: () => null
}));

vi.mock("@/features/orders/ui/order-photo-section", () => ({
  OrderPhotoSection: () => null
}));

vi.mock("@/features/vehicles/ui/vehicle-detail-panel", () => ({
  VehicleDetailPanel: () => null
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [], isLoading: false }),
  useServicesListQuery: () => ({ data: [], isLoading: false })
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useCustomFieldDefsQuery: () => ({ data: [], isLoading: false }),
  useModulesQuery: () => ({ data: { photos: false, customer_payer: true }, isLoading: false }),
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

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

vi.mock("@/shared/hooks/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    dismissWarning: vi.fn(),
    isWarningVisible: false,
    requestClose: vi.fn()
  })
}));

vi.mock("@/shared/ui/mobile-sheet", () => ({
  MobileSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock("@/shared/ui/loading-state", () => ({
  LoadingState: () => <div />
}));

vi.mock("@/shared/ui/error-state", () => ({
  ErrorState: () => <div />
}));

vi.mock("@/shared/ui/unsaved-changes-banner", () => ({
  UnsavedChangesBanner: () => null
}));

describe("order detail vehicle hydration", () => {
  it("shows the current vehicle on first open even when the vehicle list is still loading", async () => {
    currentOrder = {
      amount_to_pay: "1000.00",
      balance_due: "1000.00",
      client_summary: {
        full_name: "Тестовый Клиент 02",
        id: 1,
        phone_display: "+7 (000) 000-00-47"
      },
      client_id: 1,
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
      scheduled_for: null,
      services: [],
      services_total: "1000.00",
      status: "new",
      status_color: "#6b7280",
      status_display_name: "Новый",
      status_group: "new",
      status_history: [],
      vehicle_summary: {
        brand: "Toyota",
        client_id: 1,
        display_name: "A123BC · Toyota Camry",
        id: 7,
        model: "Camry",
        plate_number_display: "A123BC",
        vin: "VIN123"
      },
      vehicle_id: 7
    };
    currentVehicleDetail = {
      brand: "Toyota",
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
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentVehiclesLoading = true;
    currentVehicles = [];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Тестовый Клиент 02");
    expect(Array.from(container.querySelectorAll("input")).some((input) => input.value.includes("A123BC"))).toBe(true);
    expect(container.textContent).not.toContain("Выберите клиента");
    expect(container.textContent).not.toContain("Выберите автомобиль");

    act(() => {
      root.unmount();
    });
  });

  it("updates the vehicle when switching to another order", async () => {
    currentOrder = {
      amount_to_pay: "1000.00",
      balance_due: "1000.00",
      client_summary: {
        full_name: "Тестовый Клиент 02",
        id: 1,
        phone_display: "+7 (000) 000-00-47"
      },
      client_id: 1,
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
      scheduled_for: null,
      services: [],
      services_total: "1000.00",
      status: "new",
      status_color: "#6b7280",
      status_display_name: "Новый",
      status_group: "new",
      status_history: [],
      vehicle_summary: {
        brand: "Toyota",
        client_id: 1,
        display_name: "A123BC · Toyota Camry",
        id: 7,
        model: "Camry",
        plate_number_display: "A123BC",
        vin: "VIN123"
      },
      vehicle_id: 7
    };
    currentVehicleDetail = {
      brand: "Toyota",
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
      model: "Camry",
      model_id: null,
      orders: [],
      owner_history: [],
      plate_number_display: "A123BC",
      plate_number_normalized: "A123BC",
      vin: "VIN123",
      year: null
    };
    currentVehiclesLoading = true;
    currentVehicles = [];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    currentOrder = {
      ...currentOrder,
      id: 43,
      vehicle_summary: {
        brand: "Kia",
        client_id: 1,
        display_name: "B456DE · Kia Sportage",
        id: 8,
        model: "Sportage",
        plate_number_display: "B456DE",
        vin: "VIN456"
      },
      vehicle_id: 8
    };
    currentVehicleDetail = {
      ...currentVehicleDetail,
      id: 8,
      plate_number_display: "B456DE",
      plate_number_normalized: "B456DE",
      brand: "Kia",
      model: "Sportage"
    };

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="43" />);
      await Promise.resolve();
    });

    expect(Array.from(container.querySelectorAll("input")).some((input) => input.value.includes("B456DE"))).toBe(true);
    expect(Array.from(container.querySelectorAll("input")).some((input) => input.value.includes("A123BC"))).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("keeps create mode ready for an empty vehicle selection", async () => {
    currentOrder = null;
    currentVehicleDetail = null;
    currentVehiclesLoading = false;
    currentVehicles = [];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="new" />);
      await Promise.resolve();
    });

    expect(container.querySelector('input[placeholder="Выберите автомобиль или владельца"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
