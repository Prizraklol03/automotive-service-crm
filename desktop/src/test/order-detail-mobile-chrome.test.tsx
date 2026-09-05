import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/entities/order/model/types";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";

const requestCloseMock = vi.fn();
const updateOrderMock = vi.fn();
let canEditOrder = true;
let isUpdatePending = false;

const order: Order = {
  amount_to_pay: "12500.00",
  balance_due: "12500.00",
  client_id: 1,
  client_summary: { full_name: "Клиент с очень длинным именем для проверки обрезки в шапке заказа", id: 1, phone_display: "+7 (000) 000-00-47" },
  comment: null,
  completed_at: null,
  discount_type: "fixed",
  discount_value: "0.00",
  due_date: null,
  handover_at: null,
  id: 42,
  is_archived: false,
  paid_total: "0.00",
  payment_status: "unpaid",
  payments: [],
  scheduled_for: null,
  services: [],
  services_total: "12500.00",
  status: "new",
  status_color: "#6b7280",
  status_display_name: "Новый",
  status_group: "new",
  status_history: [],
  vehicle_id: 7,
  vehicle_summary: { brand: "Toyota", client_id: 1, display_name: "A123BC · Toyota Camry", id: 7, model: "Camry", plate_number_display: "A123BC", vin: "VIN123" }
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/features/auth/model/permissions", () => ({ useCan: () => canEditOrder }));
vi.mock("@/features/clients/api/clients-hooks", () => ({
  useClientDetailQuery: () => ({ data: order.client_summary, isError: false, isLoading: false, refetch: vi.fn() }),
  useClientsListQuery: () => ({ data: [order.client_summary], isError: false, isFetching: false, isLoading: false, refetch: vi.fn() })
}));
vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useVehicleDetailQuery: () => ({ data: null, isError: false, isLoading: false, refetch: vi.fn() }),
  useVehiclesListQuery: () => ({ data: [], isLoading: false, isPending: false })
}));
vi.mock("@/features/orders/api/orders-hooks", () => ({
  useCreateOrderMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: vi.fn() }),
  useOrderDetailQuery: () => ({ data: order, isError: false, isLoading: false, refetch: vi.fn() }),
  useUpdateOrderMutation: () => ({ error: null, isError: false, isPending: isUpdatePending, mutateAsync: updateOrderMock }),
  useUpdateOrderStatusMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock("@/features/notifications/api/notifications-hooks", () => ({
  useCreateOrderReminderMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useMarkReminderDoneMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useOrderRemindersQuery: () => ({ data: [], isError: false, isLoading: false, refetch: vi.fn() })
}));
vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [], isLoading: false }),
  useServicesListQuery: () => ({ data: [], isLoading: false })
}));
vi.mock("@/features/settings/api/settings-hooks", () => ({
  useCustomFieldDefsQuery: () => ({ data: [], isLoading: false }),
  useModulesQuery: () => ({ data: { customer_payer: false, photos: false }, isLoading: false }),
  useOrderFieldValuesQuery: () => ({ data: [], isLoading: false }),
  useOrderStatusesQuery: () => ({ data: [{ code: "new", color: "#6b7280", display_name: "Новый", is_default: true, sort_order: 1, status_group: "new" }], isLoading: false }),
  useUpsertOrderFieldValuesMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock("@/shared/hooks/use-overlay-mode", () => ({ useOverlayMode: () => undefined }));
vi.mock("@/shared/hooks/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({ dismissWarning: vi.fn(), isWarningVisible: false, requestClose: requestCloseMock })
}));
vi.mock("@/shared/ui/mobile-sheet", () => ({ MobileSheet: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/features/clients/ui/client-detail-panel", () => ({ ClientDetailPanel: () => null }));
vi.mock("@/features/documents/ui/order-documents-section", () => ({ OrderDocumentsSection: () => null }));
vi.mock("@/features/inspection/ui/inspection-order-section", () => ({ InspectionOrderSection: () => null }));
vi.mock("@/features/orders/ui/order-payments-section", () => ({ OrderPaymentsSection: () => null }));
vi.mock("@/features/orders/ui/order-photo-section", () => ({ OrderPhotoSection: () => null }));
vi.mock("@/features/vehicles/ui/vehicle-detail-panel", () => ({ VehicleDetailPanel: () => null }));
vi.mock("@/shared/ui/error-state", () => ({ ErrorState: () => null }));
vi.mock("@/shared/ui/loading-state", () => ({ LoadingState: () => null }));
vi.mock("@/shared/ui/unsaved-changes-banner", () => ({ UnsavedChangesBanner: () => null }));

function renderPanel(isMobile: boolean) {
  return renderToStaticMarkup(<OrderDetailPanel isMobile={isMobile} onClose={vi.fn()} orderKey="42" />);
}

beforeEach(() => {
  canEditOrder = true;
  isUpdatePending = false;
  requestCloseMock.mockReset();
  updateOrderMock.mockReset().mockResolvedValue(order);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("order detail mobile chrome", () => {
  it("renders a single-line mobile header that keeps the order number and close button while truncating a long client name", () => {
    const html = renderPanel(true);

    expect(html).toContain("Заказ №42 · ");
    expect(html).toContain("Клиент с очень длинным именем для проверки обрезки в шапке заказа");
    expect(html).toContain("flex min-w-0 flex-1 items-baseline text-base font-semibold leading-tight");
    expect(html).toContain("min-w-0 truncate");
    expect(html).toContain('aria-label="Закрыть заказ"');
    expect(html).toContain("shrink-0");
    expect(html).not.toContain("uppercase tracking-[0.2em] text-muted-foreground\">Заказ</p>");
  });

  it("renders the compact mobile footer with a wider save action beside cancel", () => {
    const html = renderPanel(true);

    expect(html).toContain("flex items-baseline gap-2");
    expect(html).toContain("К оплате");
    expect(html).toContain("₽");
    expect(html).toContain("flex w-full min-w-0 gap-2 overflow-hidden");
    expect(html).toContain("min-w-0 flex-[2]");
    expect(html).toContain("min-w-0 flex-1");
    expect(html).not.toContain("justify-end");
    expect(html).toContain("mobile-sheet-footer shrink-0 border-t border-border");
    expect(html).toContain("px-4 py-3");
  });

  it("keeps save and cancel handlers", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDetailPanel isMobile onClose={vi.fn()} orderKey="42" />);
      await Promise.resolve();
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Сохранить заказ");
    const cancelButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Отменить");
    expect(saveButton).toBeDefined();
    expect(cancelButton).toBeDefined();

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });
    cancelButton?.click();

    expect(updateOrderMock).toHaveBeenCalledTimes(1);
    expect(requestCloseMock).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  }, 15_000);

  it("preserves permission behavior by hiding mobile save while keeping cancel", () => {
    canEditOrder = false;
    const html = renderPanel(true);

    expect(html).not.toContain("Сохранить заказ");
    expect(html).toContain("Отменить");
  });

  it("keeps the mobile save action disabled while its mutation is pending", () => {
    isUpdatePending = true;
    const container = document.createElement("div");
    container.innerHTML = renderPanel(true);

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Сохранить заказ");
    expect(saveButton?.disabled).toBe(true);
  });

  it("preserves the desktop overlay header and footer layout without mobile-only classes", () => {
    const html = renderPanel(false);

    expect(html).toContain("uppercase tracking-[0.2em] text-muted-foreground\">Заказ</p>");
    expect(html).toContain("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between");
    expect(html).not.toContain("flex min-w-0 flex-1 items-baseline text-base font-semibold leading-tight");
    expect(html).not.toContain("flex w-full min-w-0 gap-2 overflow-hidden");
  });
});
