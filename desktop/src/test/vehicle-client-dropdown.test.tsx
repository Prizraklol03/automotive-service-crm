import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VehicleDetail } from "@/entities/vehicle/model/types";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";

const currentAuthUser = {
  id: 1,
  login: "employee",
  permissions: ["clients.create", "vehicles.edit", "vehicles.create"] as string[],
  role_code: "standard_user" as const
};

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: typeof currentAuthUser | null }) => unknown) => selector({ user: currentAuthUser })
}));

const vehicleDetail: VehicleDetail = {
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
  orders: [],
  owner_history: [],
  plate_number_display: "A777AA00",
  plate_number_normalized: "A777AA00",
  vin: null,
  year: 2022
};

const otherClients = [
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
    id: 3,
    is_deleted: false,
    phone_display: "+7 (000) 000-00-02",
    phone_normalized: "+70000000002",
    telegram_username: null
  },
  {
    comment: null,
    deleted_at: null,
    full_name: "Demo Customer 35",
    id: 4,
    is_deleted: false,
    phone_display: "+7 (000) 000-00-21",
    phone_normalized: "+70000000021",
    telegram_username: null
  }
];

const clientsQueryState = {
  data: undefined as typeof otherClients | undefined,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn()
};

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useClientDetailQuery: (clientId: number | null) => ({
    data: clientId ? otherClients.find((client) => client.id === clientId) ?? null : null,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useClientsListQuery: (_search: string, enabled = true) => (enabled ? clientsQueryState : { data: undefined, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() })
}));

let lastOpenedClientKey: string | null = null;
vi.mock("@/features/clients/ui/client-detail-panel", () => ({
  ClientDetailPanel: ({ clientKey }: { clientKey: string | null }) => {
    lastOpenedClientKey = clientKey;
    return null;
  }
}));

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useArchiveVehicleMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCarBrandsQuery: () => ({ data: [] }),
  useCarModelsByBrandQuery: () => ({ data: [] }),
  useCreateVehicleMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUpdateVehicleMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useVehicleDetailQuery: () => ({ data: vehicleDetail, isError: false, isLoading: false, refetch: vi.fn() })
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

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return {
    container,
    async render() {
      await act(async () => {
        root.render(<VehicleDetailPanel isMobile={false} onClose={vi.fn()} onCreated={vi.fn()} vehicleKey="2" />);
        await Promise.resolve();
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function openClientDropdown(container: HTMLElement) {
  const label = Array.from(container.querySelectorAll("label")).find((node) => node.querySelector("span")?.textContent === "Клиент");
  expect(label).not.toBeUndefined();
  const input = label?.querySelector("input") as HTMLInputElement | null;
  expect(input).not.toBeNull();
  act(() => {
    input?.focus();
  });
  return input!;
}

beforeEach(() => {
  document.body.innerHTML = "";
  clientsQueryState.data = undefined;
  clientsQueryState.isError = false;
  clientsQueryState.isFetching = false;
  clientsQueryState.isLoading = false;
  clientsQueryState.refetch.mockClear();
  lastOpenedClientKey = null;
});

describe("vehicle owner dropdown loading", () => {
  it("loads the full client list after the panel opens, not just the current owner", async () => {
    clientsQueryState.data = otherClients;

    const { container, render, unmount } = mount();
    await render();

    const input = openClientDropdown(container);
    const dropdown = input.closest(".relative");
    expect(dropdown?.textContent).toContain("Demo Customer 03");
    expect(dropdown?.textContent).toContain("Demo Customer 11");
    expect(dropdown?.textContent).toContain("Demo Customer 35");
    expect(dropdown?.textContent).toContain("+ Новый клиент");

    unmount();
  });

  it("refetches on open when the list previously failed to load", async () => {
    clientsQueryState.data = undefined;
    clientsQueryState.isError = true;

    const { container, render, unmount } = mount();
    await render();

    openClientDropdown(container);
    expect(clientsQueryState.refetch).toHaveBeenCalled();

    unmount();
  });

  it("keeps the current owner visible while the full list is still loading", async () => {
    clientsQueryState.data = undefined;
    clientsQueryState.isLoading = true;
    clientsQueryState.isFetching = true;

    const { container, render, unmount } = mount();
    await render();

    const input = openClientDropdown(container);
    const dropdown = input.closest(".relative");
    expect(dropdown?.textContent).toContain("Demo Customer 03");
    expect(dropdown?.textContent).not.toContain("Не удалось загрузить");

    unmount();
  });

  it("merges the loaded list with the current owner without duplicating it", async () => {
    clientsQueryState.data = otherClients;

    const { container, render, unmount } = mount();
    await render();

    const input = openClientDropdown(container);
    const dropdown = input.closest(".relative");
    const ownerMatches = dropdown?.textContent?.match(/Demo Customer 03/g) ?? [];
    expect(ownerMatches.length).toBe(1);

    unmount();
  });

  it("has no edit-pencil button for the owner and changes it directly via the dropdown without navigating away", async () => {
    clientsQueryState.data = otherClients;

    const { container, render, unmount } = mount();
    await render();

    const editButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label") === "Изменить владельца"
    );
    expect(editButton).toBeUndefined();

    const input = openClientDropdown(container);
    const dropdown = input.closest(".relative");
    const option = Array.from(dropdown?.querySelectorAll("button") ?? []).find((button) => button.textContent?.includes("Demo Customer 35"));
    expect(option).not.toBeUndefined();

    act(() => {
      option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(input.value).toContain("Demo Customer 35");
    expect(lastOpenedClientKey).toBeNull();

    unmount();
  });

  it("shows an error state with a working retry action", async () => {
    clientsQueryState.data = undefined;
    clientsQueryState.isError = true;

    const { container, render, unmount } = mount();
    await render();

    const input = openClientDropdown(container);
    const dropdown = input.closest(".relative");
    expect(dropdown?.textContent).toContain("Не удалось загрузить, повторить");

    const retryButton = Array.from(dropdown?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("Повторить")
    );
    expect(retryButton).not.toBeUndefined();

    clientsQueryState.refetch.mockClear();
    act(() => {
      retryButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    expect(clientsQueryState.refetch).toHaveBeenCalled();

    unmount();
  });
});
