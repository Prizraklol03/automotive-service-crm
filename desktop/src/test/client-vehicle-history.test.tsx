import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )
  };
});

const currentAuthUser = {
  id: 1,
  login: "employee",
  permissions: [] as string[],
  role_code: "standard_user" as const
};

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: typeof currentAuthUser | null }) => unknown) => selector({ user: currentAuthUser })
}));

import type { ClientDetail } from "@/entities/client/model/types";
import type { VehicleDetail } from "@/entities/vehicle/model/types";
import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";

const clientDetailData: ClientDetail = {
  comment: null,
  deleted_at: null,
  full_name: "Demo Customer 03",
  id: 1,
  is_deleted: false,
  orders: [
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
  phone_display: "+7 (000) 000-00-01",
  phone_normalized: "+70000000001",
  telegram_username: null
};

const emptyClientDetailData: ClientDetail = {
  ...clientDetailData,
  orders: []
};

const vehicleDetailData: VehicleDetail = {
  brand: "Lada",
  brand_id: null,
  client_id: 1,
  color: "BLACK",
  comment: null,
  current_owner_full_name: "Demo Customer 11",
  current_owner_phone_display: "+7 (000) 000-00-02",
  deleted_at: null,
  id: 2,
  is_deleted: false,
  mileage: 10000,
  model: "Vesta",
  model_id: null,
  orders: [
    {
      amount_to_pay: "2000.00",
      balance_due: "0.00",
      category_colors: [],
      client_full_name: "Demo Customer 11",
      client_id: 2,
      client_phone: "+70000000002",
      comment: "New owner order",
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
      vehicle_id: 2,
      vehicle_model: "Vesta",
      vehicle_plate_number: "A777AA00",
      vehicle_vin: null
    }
  ],
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
    },
    {
      client_full_name: "Demo Customer 03",
      client_id: 1,
      comment: null,
      id: 1,
      owned_from: "2026-01-10",
      owned_to: "2026-05-02",
      status: "former",
      title: "Новый владелец — Ivan Petrov"
    }
  ],
  plate_number_display: "A777AA00",
  plate_number_normalized: "A777AA00",
  vin: null,
  year: 2022
};

let currentClientDetailData = clientDetailData;
let currentVehicleDetailData = vehicleDetailData;
const clientListData = [
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
const vehicleListData = [
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
  }
];

const currentVehicleListState = {
  data: vehicleListData,
  isError: false,
  isLoading: false,
  refetch: vi.fn()
};

beforeEach(() => {
  document.body.innerHTML = "";
  currentClientDetailData = clientDetailData;
  currentVehicleDetailData = vehicleDetailData;
  currentVehicleListState.data = vehicleListData;
  currentVehicleListState.isLoading = false;
  currentVehicleListState.isError = false;
  currentAuthUser.permissions = ["orders.view"];
});

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useArchiveClientMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useClientDetailQuery: () => ({ data: currentClientDetailData, isError: false, isLoading: false, refetch: vi.fn() }),
  useClientOrdersQuery: () => ({ data: { orders: currentClientDetailData.orders }, isError: false, isLoading: false, refetch: vi.fn() }),
  useCreateClientMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUpdateClientMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useClientsListQuery: () => ({ data: clientListData }),
  useVehiclesListQuery: () => currentVehicleListState
}));

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useArchiveVehicleMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCarBrandsQuery: () => ({ data: [] }),
  useCarModelsByBrandQuery: () => ({ data: [] }),
  useCreateVehicleMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useClientVehiclesQuery: () => currentVehicleListState,
  useUpdateVehicleMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useVehicleDetailQuery: () => ({ data: currentVehicleDetailData, isError: false, isLoading: false, refetch: vi.fn() }),
  useVehiclesListQuery: () => currentVehicleListState
}));

describe("client and vehicle history panels", () => {
  it("renders client order history in the client card and shows an empty state when there are no orders", () => {
    const fullHtml = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="1"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    expect(fullHtml).toContain("История заказов");
    expect(fullHtml).toContain("Заказ #10");
    expect(fullHtml).toContain("A777AA00");
    expect(fullHtml).toContain("fixed inset-y-0 right-0 hidden h-[100svh] w-[min(860px,calc(100vw-2rem))] max-w-full border-l border-border/80 bg-background lg:flex");
    expect(fullHtml).not.toContain("Есть несохранённые изменения");
    expect(fullHtml).not.toContain("Заказов пока нет");

    currentClientDetailData = emptyClientDetailData;

    const emptyHtml = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="1"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    expect(emptyHtml).toContain("Заказов пока нет");
    currentClientDetailData = clientDetailData;
  });

  it("hides the history block when orders.view is missing", () => {
    currentAuthUser.permissions = [];

    const clientHtml = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="1"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    const vehicleHtml = renderToStaticMarkup(
      <VehicleDetailPanel
        clientPresetId={1}
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        vehicleKey="2"
      />
    );

    expect(clientHtml).not.toContain("История заказов");
    expect(vehicleHtml).not.toContain("История заказов");
    currentAuthUser.permissions = ["orders.view"];
  });

  it("shows a loading state for related client vehicles before the vehicle list arrives", () => {
    currentVehicleListState.data = undefined as unknown as typeof vehicleListData;
    currentVehicleListState.isLoading = true;

    const html = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="1"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    expect(html).toContain("Загружаем автомобили клиента");
    expect(html).not.toContain("У клиента пока нет автомобилей");
    currentVehicleListState.data = vehicleListData;
    currentVehicleListState.isLoading = false;
  });

  it("renders vehicle order history, owner history and keeps owner editing inside the normal field", () => {
    const html = renderToStaticMarkup(
      <VehicleDetailPanel
        clientPresetId={1}
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        vehicleKey="2"
      />
    );

    expect(html).toContain("Текущий владелец");
    expect(html).toContain("История заказов");
    expect(html).toContain("История владельцев");
    expect(html).toContain("Заказ #11");
    expect(html).toContain("Demo Customer 11");
    expect(html).not.toContain("Есть несохранённые изменения");
    expect(html).toContain("fixed inset-y-0 right-0 hidden h-[100svh] w-[min(860px,calc(100vw-2rem))] max-w-full border-l border-border/80 bg-background lg:flex");
    expect(html).toContain("Новый владелец");
    expect(html).not.toContain("Сменить владельца");

    currentVehicleDetailData = {
      ...vehicleDetailData,
      current_owner_full_name: "Demo Customer 03",
      current_owner_phone_display: "+7 (000) 000-00-01"
    };

    const updatedHtml = renderToStaticMarkup(
      <VehicleDetailPanel
        clientPresetId={1}
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        vehicleKey="2"
      />
    );

    expect(updatedHtml).toContain("Demo Customer 03");
    currentVehicleDetailData = vehicleDetailData;
  });

  it("keeps the client footer visually docked to the panel bottom without floating styles", () => {
    const html = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="1"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    expect(html).toContain("mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5");
    expect(html).not.toContain("sticky bottom-0 z-[1] bg-background/95 backdrop-blur");
    expect(html).toContain("<button");
    expect(html).not.toContain("mt-5 flex gap-3 border-t border-border/80 bg-background/95");
  });

  it("keeps the vehicle footer visually docked to the panel bottom without floating styles", () => {
    const html = renderToStaticMarkup(
      <VehicleDetailPanel
        clientPresetId={1}
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        vehicleKey="2"
      />
    );

    expect(html).toContain("mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5");
    expect(html).not.toContain("sticky bottom-0 z-[1] bg-background/95 backdrop-blur");
    expect(html).not.toContain("mt-5 flex gap-3 border-t border-border/80 bg-background/95");
  });

  it("hides client and vehicle create/save actions when the user has no matching permissions", () => {
    currentAuthUser.permissions = [];

    const clientHtml = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="1"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    expect(clientHtml).not.toContain("Новый авто");
    expect(clientHtml).not.toContain("Сохранить клиента");

    const createClientHtml = renderToStaticMarkup(
      <ClientDetailPanel
        clientKey="new"
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenVehicle={() => undefined}
        onVehicleClose={() => undefined}
        onVehicleCreated={() => undefined}
        vehicleKey={null}
      />
    );

    expect(createClientHtml).not.toContain("Создать клиента");

    const vehicleHtml = renderToStaticMarkup(
      <VehicleDetailPanel
        clientPresetId={1}
        desktopMode="overlay"
        isMobile={false}
        onClose={() => undefined}
        onCreated={() => undefined}
        vehicleKey="2"
      />
    );

    expect(vehicleHtml).not.toContain("+ Новый клиент");
    expect(vehicleHtml).not.toContain("Сохранить автомобиль");
  });
});
