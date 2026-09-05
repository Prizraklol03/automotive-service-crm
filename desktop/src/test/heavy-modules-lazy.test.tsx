import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentDetailPanel } from "@/features/documents/ui/document-detail-panel";
import { MaterialDetailPanel } from "@/features/materials/ui/material-detail-panel";
import { NotificationDetailPanel } from "@/features/notifications/ui/notification-detail-panel";
import { OrderPhotoSection } from "@/features/orders/ui/order-photo-section";
import { NotificationsPage } from "@/pages/notifications-page";

const calls = vi.hoisted(() => ({
  clientsList: [] as Array<[string, boolean]>,
  documentPreview: [] as Array<[number | null, boolean]>,
  materialDownload: [] as Array<[number, number]>,
  materialAttachments: [] as Array<[number | null, boolean]>,
  notificationsList: [] as Array<[string]>,
  notificationsSummary: 0,
  orderPhotos: [] as Array<[number | null, boolean]>,
  ordersList: [] as Array<[string, boolean]>,
  reminderDetail: [] as Array<[number | null]>,
  shareInfo: [] as Array<[number | null, boolean]>,
  vehiclesList: [] as Array<[string, boolean]>
}));

const reminderDetail = {
  completed_at: null,
  due_at: "2026-05-14T10:00:00",
  effective_status: "active",
  id: 1,
  is_overdue: true,
  postpone_until: null,
  repeat_rule: null,
  status: "active",
  target_id: 11,
  target_summary: {
    subtitle: "A777AA00 · Lada Vesta",
    target_id: 11,
    target_type: "order",
    title: "Заказ #11"
  },
  target_type: "order",
  text: "Check order",
  created_at: "2026-05-13T10:00:00",
  created_by_user_id: 1,
  updated_at: "2026-05-13T10:00:00"
};

const documentDetail = {
  created_at: "2026-05-13T10:00:00",
  created_by_user_id: 1,
  docx_file: { exists: false, filename: null, mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", storage_path: null },
  document_number: 11,
  document_type: "work_order",
  id: 1,
  last_pdf_engine: null,
  last_pdf_generation_note: null,
  last_rendered_at: null,
  manual_fields_by_design: [],
  order_id: 11,
  order_summary: {
    client_summary: { full_name: "Demo Customer 03", id: 1, phone_display: "+7 (000) 000-00-01" },
    id: 11,
    vehicle_summary: {
      brand: "Lada",
      client_id: 1,
      display_name: "A777AA00 · Lada Vesta",
      id: 2,
      model: "Vesta",
      plate_number_display: "A777AA00",
      vin: null
    }
  },
  pdf_file: { exists: false, filename: null, mime_type: "application/pdf", storage_path: null },
  storage_docx_path: null,
  storage_pdf_path: null,
  template: {
    code: "work_order",
    created_at: "2026-05-13T10:00:00",
    id: 1,
    is_active: true,
    name: "Work order",
    storage_path: "/templates/work_order.docx",
    updated_at: "2026-05-13T10:00:00"
  },
  template_id: 1,
  unresolved_placeholders: [],
  updated_at: "2026-05-13T10:00:00",
  work_completed_at: null,
  work_started_at: "2026-05-13T10:00:00"
};

const materialDetail = {
  attachments_count: 1,
  expense_date: "2026-05-13",
  id: 1,
  material_name: "Foam",
  quantity: 2,
  service_category_id: 1,
  service_category_name: "Chemicals",
  unit_price: "150.00"
};

beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  calls.clientsList.length = 0;
  calls.documentPreview.length = 0;
  calls.materialDownload.length = 0;
  calls.materialAttachments.length = 0;
  calls.notificationsList.length = 0;
  calls.notificationsSummary = 0;
  calls.orderPhotos.length = 0;
  calls.ordersList.length = 0;
  calls.reminderDetail.length = 0;
  calls.shareInfo.length = 0;
  calls.vehiclesList.length = 0;
});

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { id: number; role_code: string } | null }) => unknown) =>
    selector({ user: { id: 1, role_code: "standard_user" } })
}));

vi.mock("@/shared/hooks/use-overlay-mode", () => ({
  useOverlayMode: () => undefined
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => false
}));

vi.mock("@/shared/hooks/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    dismissWarning: vi.fn(),
    isWarningVisible: false,
    requestClose: vi.fn()
  })
}));

vi.mock("@/features/notifications/api/notifications-hooks", () => ({
  useCreateOrderReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useMarkReminderDoneMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useNotificationsListQuery: (scope: string) => {
    calls.notificationsList.push([scope]);
    return { data: [], isError: false, isLoading: false, isPending: false, refetch: vi.fn() };
  },
  useNotificationsSummaryQuery: () => {
    calls.notificationsSummary += 1;
    return {
      data: { all: 1, due: 1, history: 0, scheduled: 0 },
      isError: false,
      isLoading: false,
      isPending: false,
      refetch: vi.fn()
    };
  },
  useOrderRemindersQuery: () => ({ data: [], isError: false, isLoading: false, refetch: vi.fn() }),
  useReminderDetailQuery: (reminderId: number | null) => {
    calls.reminderDetail.push([reminderId]);
    return { data: reminderDetail, isError: false, isLoading: false, refetch: vi.fn() };
  },
  useRepeatReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePostponeReminderMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/clients/api/clients-hooks", () => ({
  useClientsListQuery: (search: string, enabled = true) => {
    calls.clientsList.push([search, enabled]);
    return {
      data: [{ full_name: "Demo Customer 03", id: 1, phone_display: "+7 (000) 000-00-01" }],
      isError: false,
      isLoading: false
    };
  }
}));

vi.mock("@/features/vehicles/api/vehicles-hooks", () => ({
  useVehiclesListQuery: (search: string, enabled = true) => {
    calls.vehiclesList.push([search, enabled]);
    return {
      data: [{ brand: "Lada", id: 2, model: "Vesta", plate_number_display: "A777AA00" }],
      isError: false,
      isLoading: false
    };
  }
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useOrdersListQuery: ({ search }: { search: string }, enabled = true) => {
    calls.ordersList.push([search, enabled]);
    return {
      data: [{ client_full_name: "Demo Customer 03", id: 11, vehicle_brand: "Lada", vehicle_model: "Vesta", vehicle_plate_number: "A777AA00" }],
      isError: false,
      isLoading: false
    };
  }
}));

vi.mock("@/features/documents/api/documents-hooks", () => ({
  useDocumentDetailQuery: () => ({ data: documentDetail, isError: false, isLoading: false, refetch: vi.fn() }),
  useDocumentPreviewQuery: (documentId: number | null, enabled = true) => {
    calls.documentPreview.push([documentId, enabled]);
    return { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
  },
  useUpdateDocumentWorkDatesMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/orders/api/order-photos-hooks", () => ({
  useDeletePhotoMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useGenerateShareMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useOrderPhotosQuery: (orderId: number | null, enabled = true) => {
    calls.orderPhotos.push([orderId, enabled]);
    return {
      data: [
        { filename: "first.jpg", id: 1, order_id: 42, sort_order: 0, stage: "before", created_at: "2026-05-13T10:00:00" },
        { filename: "second.jpg", id: 2, order_id: 42, sort_order: 1, stage: "after", created_at: "2026-05-13T10:05:00" }
      ],
      isError: false,
      isLoading: false,
      isPending: false,
      refetch: vi.fn()
    };
  },
  usePhotoObjectUrl: () => ({ data: undefined, isPending: false }),
  useRevokeShareMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useShareInfoQuery: (orderId: number | null, enabled = true) => {
    calls.shareInfo.push([orderId, enabled]);
    return { data: { share_token: "public-token", share_url: "https://share.example.invalid" }, isPending: false, isLoading: false, isError: false };
  },
  useUploadPhotosMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/materials/api/materials-hooks", () => ({
  downloadMaterialAttachment: (materialId: number, attachmentId: number) => {
    calls.materialDownload.push([materialId, attachmentId]);
    return Promise.resolve({ blob: new Blob(["file"]), filename: "foam.txt" });
  },
  useCreateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialAttachmentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useMaterialAttachmentsQuery: (materialId: number | null, enabled = true) => {
    calls.materialAttachments.push([materialId, enabled]);
    return {
      data: [
        { created_at: "2026-05-13T10:00:00", file_name: "foam.txt", id: 1, material_id: 1, mime_type: "text/plain", size: 100, storage_path: "/tmp/foam.txt" }
      ],
      isError: false,
      isLoading: false
    };
  },
  useMaterialDetailQuery: () => ({ data: materialDetail, isError: false, isLoading: false, refetch: vi.fn() }),
  useUpdateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUploadMaterialAttachmentMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [{ id: 1, name: "Chemicals" }], isLoading: false })
}));

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

describe("heavy module lazy loading", () => {
  it("loads only the active notifications scope and the lightweight summary on page mount", () => {
    const { unmount } = mount(
      <MemoryRouter initialEntries={["/notifications"]}>
        <NotificationsPage />
      </MemoryRouter>
    );

    expect(calls.notificationsList).toEqual([["due"]]);
    expect(calls.notificationsSummary).toBe(1);
    expect(calls.notificationsList.some(([scope]) => scope === "history")).toBe(false);

    unmount();
  });

  it("keeps reminder target lists lazy until the edit block is opened", async () => {
    const { container, unmount } = mount(
      <MemoryRouter>
        <NotificationDetailPanel isMobile={false} onClose={vi.fn()} reminderKey="1" />
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(calls.clientsList.length).toBeGreaterThan(0);
    expect(calls.clientsList.every(([, enabled]) => enabled === false)).toBe(true);
    expect(calls.vehiclesList.length).toBeGreaterThan(0);
    expect(calls.vehiclesList.every(([, enabled]) => enabled === false)).toBe(true);
    expect(calls.ordersList.length).toBeGreaterThan(0);
    expect(calls.ordersList.every(([, enabled]) => enabled === false)).toBe(true);

    unmount();
  });

  it("does not load document preview until the preview block is opened", async () => {
    const { container, unmount } = mount(
      <MemoryRouter>
        <DocumentDetailPanel documentId={1} isMobile={false} onClose={vi.fn()} />
      </MemoryRouter>
    );

    expect(calls.documentPreview.length).toBeGreaterThan(0);
    expect(calls.documentPreview.every(([, enabled]) => enabled === false)).toBe(true);

    const previewButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Показать"));
    expect(previewButton).toBeTruthy();

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(calls.documentPreview.at(-1)).toEqual([1, true]);

    unmount();
  });

  it("keeps order photos and share info lazy until their blocks are opened", async () => {
    const { container, unmount } = mount(
      <OrderPhotoSection isModernDesktop={false} orderId={42} sectionClassName="rounded-2xl border" useDesktopStagePicker={false} />
    );

    expect(calls.orderPhotos).toEqual([[42, false]]);
    expect(calls.shareInfo).toEqual([]);

    const openButtons = Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes("Показать"));
    expect(openButtons.length).toBeGreaterThan(0);

    await act(async () => {
      openButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(calls.orderPhotos.at(-1)).toEqual([42, true]);

    const shareOpenButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Показать"));
    expect(shareOpenButton).toBeTruthy();

    await act(async () => {
      shareOpenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(calls.shareInfo.at(-1)).toEqual([42, true]);

    unmount();
  });

  it("shows material attachments immediately and keeps downloads lazy until requested", async () => {
    const { container, unmount } = mount(
      <MaterialDetailPanel isMobile={false} materialKey="1" onClose={vi.fn()} />
    );

    expect(calls.materialAttachments.length).toBeGreaterThan(0);
    expect(calls.materialAttachments.every(([, enabled]) => enabled === true)).toBe(true);
    expect(calls.materialDownload).toEqual([]);
    expect(container.textContent).toContain("Вложения");
    expect(container.textContent).not.toContain("Список вложений загрузится после раскрытия блока");
    expect(container.textContent).not.toContain("Свернуть");

    const downloadButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Скачать"));
    expect(downloadButton).toBeTruthy();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:mock")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: vi.fn()
    });

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(calls.materialDownload).toEqual([[1, 1]]);

    unmount();
  });
});
