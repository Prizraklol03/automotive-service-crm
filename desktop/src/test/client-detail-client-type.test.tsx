import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { permissions: string[] } | null }) => unknown) => selector({ user: { permissions: ["clients.create", "clients.edit", "vehicles.create", "orders.view"] } })
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useArchiveClientMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useClientDetailQuery: () => ({ data: null, isError: false, isLoading: false, refetch: vi.fn() }),
  useClientOrdersQuery: () => ({ data: { orders: [] }, isError: false, isLoading: false, refetch: vi.fn() }),
  useCreateClientMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUpdateClientMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useClientVehiclesQuery: () => ({ data: [], isError: false, isLoading: false, refetch: vi.fn() })
}));

import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button "${text}" not found`);
  }

  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("client detail panel client type", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("switches between individual and legal fields in the create form", () => {
    const { container, unmount } = mount(
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

    expect(container.querySelector('input[name="full_name"]')).not.toBeNull();
    expect(container.querySelector('input[name="company_name"]')).toBeNull();

    clickButton(container, "Юридическое лицо");

    expect(container.querySelector('input[name="full_name"]')).toBeNull();
    expect(container.querySelector('input[name="company_name"]')).not.toBeNull();
    expect(container.textContent).toContain("Название организации");
    expect(container.textContent).toContain("ИНН");
    expect(container.textContent).toContain("Юридический адрес");

    clickButton(container, "Физическое лицо");

    expect(container.querySelector('input[name="full_name"]')).not.toBeNull();
    expect(container.querySelector('input[name="company_name"]')).toBeNull();

    unmount();
  });
});
