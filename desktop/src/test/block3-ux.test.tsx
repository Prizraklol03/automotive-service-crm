import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { AppInput } from "@/shared/ui/app-input";
import { getDefaultDateTimeValue } from "@/shared/lib/datetime";
import { FinancePage } from "@/pages/finance-page";
import { MaterialsPage } from "@/pages/materials-page";
import { VisualSettingsCard } from "@/features/settings/ui/visual-settings-card";
import { InspectionOrderSection } from "@/features/inspection/ui/inspection-order-section";
import { MaterialDetailPanel } from "@/features/materials/ui/material-detail-panel";
import { OrderDocumentsSection } from "@/features/documents/ui/order-documents-section";

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { id: number; role_code: string } | null }) => unknown) =>
    selector({ user: { id: 1, role_code: "admin" } })
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useUpdateVisualConfigMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVisualConfigQuery: () => ({
    data: { accent_hue: null, preset: null, status_colors: null, ui_density: null, working_month_start_day: 25 },
    isError: false,
    isLoading: false
  })
}));

vi.mock("@/features/materials/api/materials-hooks", () => ({
  downloadMaterialAttachment: vi.fn(),
  useCreateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialAttachmentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useMaterialAttachmentsQuery: () => ({
    data: [
      {
        created_at: "2026-05-13T10:00:00",
        created_by_user_id: 1,
        file_name: "invoice.pdf",
        id: 1,
        material_id: 1,
        mime_type: "application/pdf",
        size: 1024,
        storage_path: "storage/material_attachments/1_invoice.pdf"
      }
    ],
    isError: false,
    isLoading: false
  }),
  useMaterialDetailQuery: () => ({
    data: {
      attachments_count: 1,
      expense_date: "2026-05-13",
      id: 1,
      material_name: "Foam",
      quantity: 2,
      row_total: "300.00",
      service_category_id: null,
      service_category_name: null,
      unit_price: "150.00"
    },
    isError: false,
    isLoading: false
  }),
  useMaterialsInfiniteQuery: () => ({
    data: {
      items: [
        {
          attachments_count: 0,
          expense_date: "2026-05-13",
          id: 1,
          material_name: "Foam",
          quantity: 2,
          row_total: "300.00",
          service_category_id: 1,
          service_category_name: "Chemicals",
          unit_price: "150.00"
        }
      ],
      page: 1,
      page_size: 50,
      total: 1
    },
    items: [
      {
        attachments_count: 0,
        expense_date: "2026-05-13",
        id: 1,
        material_name: "Foam",
        quantity: 2,
        row_total: "300.00",
        service_category_id: 1,
        service_category_name: "Chemicals",
        unit_price: "150.00"
      }
    ],
    isError: false,
    isFetching: false,
    isLoading: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    loadedCount: 1,
    refetch: vi.fn()
  }),
  useMaterialsSummaryQuery: () => ({
    data: {
      categories: [],
      total_amount: 300
    },
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useMaterialsQuery: () => ({
    data: [
      {
        attachments_count: 0,
        category_name: "Chemicals",
        comment: "Soap",
        expense_date: "2026-05-13",
        id: 1,
        material_name: "Foam",
        quantity: 2,
        row_total: "300.00",
        service_category_id: 1,
        service_category_name: "Chemicals",
        unit_price: "150.00"
      }
    ],
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useUpdateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUploadMaterialAttachmentMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [{ id: 1, name: "Polish" }] })
}));

vi.mock("@/features/finance/api/finance-hooks", () => ({
  useCreateFinanceCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateFinanceExpenseMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteFinanceCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteFinanceExpenseMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useFinanceCategoriesQuery: () => ({ data: [{ id: 1, name: "Other" }], isError: false, isLoading: false }),
  useFinanceExpenseDetailQuery: () => ({
    data: { amount: "500.00", category_id: 1, comment: "Stationery", expense_date: "2026-05-13" },
    isError: false,
    isLoading: false
  }),
  useFinanceExpensesInfiniteQuery: () => ({
    data: {
      items: [{ amount: "500.00", category_name: "Other", comment: "Stationery", expense_date: "2026-05-13", id: 1 }],
      page: 1,
      page_size: 50,
      total: 1
    },
    items: [{ amount: "500.00", category_name: "Other", comment: "Stationery", expense_date: "2026-05-13", id: 1 }],
    isError: false,
    isFetching: false,
    isLoading: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    loadedCount: 1,
    refetch: vi.fn()
  }),
  useFinanceExpensesQuery: () => ({
    data: [
      { amount: "500.00", category_name: "Other", comment: "Stationery", expense_date: "2026-05-13", id: 1 }
    ],
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useFinanceSummaryQuery: () => ({
    data: { total_amount: 500 },
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useUpdateFinanceCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateFinanceExpenseMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/documents/api/documents-hooks", () => ({
  useEnsureOrderDocumentMutation: () => ({ mutateAsync: vi.fn() }),
  useOrderDocumentsQuery: () => ({
    data: [
      {
        docx_file: { filename: "work-order.docx" },
        document_type: "work_order",
        id: 1,
        pdf_file: { filename: "work-order.pdf" },
        work_completed_at: "2026-05-13T12:00:00",
        work_started_at: "2026-05-13T10:00:00"
      }
    ],
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useUpdateDocumentWorkDatesMutation: () => ({ isError: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useOrderDetailQuery: () => ({
    data: { completed_at: "2026-05-13T12:00:00", status_history: [] },
    isError: false,
    isLoading: false
  })
}));

vi.mock("@/features/inspection/api/inspection-hooks", () => ({
  useConfirmInspectionSessionMutation: () => ({ mutateAsync: vi.fn() }),
  useCurrentInspectionSessionQuery: () => ({
    data: {
      general_photos_count: 0,
      id: 1,
      latest_export: null,
      mark_photos_count: 0,
      marks_count: 0,
      started_at: "2026-05-13T10:00:00",
      status: "draft",
      updated_at: "2026-05-13T10:00:00",
      updated_by: null
    },
    isLoading: false
  }),
  useGenerateInspectionActMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useLockInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useReopenInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useStartInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/inspection/ui/inspection-editor", () => ({
  InspectionEditor: () => null
}));

beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      media: "",
      matches: false,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function GuardProbe({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(dirty, onClose);

  return (
    <div>
      <button type="button" onClick={requestClose}>
        Close
      </button>
      {isWarningVisible ? (
        <div>
          <p>Есть несохранённые изменения</p>
          <button type="button" onClick={dismissWarning}>
            Продолжить редактирование
          </button>
          <button type="button" onClick={onClose}>
            Закрыть без сохранения
          </button>
        </div>
      ) : null}
    </div>
  );
}

describe("Block 3 UX", () => {
  it("shows an internal unsaved-changes warning without browser prompts", () => {
    const onClose = vi.fn();
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<GuardProbe dirty onClose={onClose} />);
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    act(() => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("Есть несохранённые изменения");
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Закрыть без сохранения"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("keeps mobile-friendly base font size on shared inputs", () => {
    const html = renderToStaticMarkup(<AppInput placeholder="Search" type="text" />);
    expect(html).toContain("text-base");
  });

  it("defaults datetime helpers to minute 00", () => {
    expect(getDefaultDateTimeValue()).toMatch(/T\d{2}:00$/);
  });

  it("shows the working month setting and hides non-custom date rows", () => {
    const visualHtml = renderToStaticMarkup(<VisualSettingsCard />);
    expect(visualHtml).toContain('value="25"');

    const materialsHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/materials"]}>
        <MaterialsPage />
      </MemoryRouter>
    );
    expect(materialsHtml).toContain('value="working_month"');
    expect(materialsHtml).toContain('type="date"');
    expect(materialsHtml).toContain("Период:");
    expect(materialsHtml).not.toContain("По умолчанию:");

    const financeHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/finance"]}>
        <FinancePage />
      </MemoryRouter>
    );
    expect(financeHtml).toContain('value="working_month"');
    expect(financeHtml).toContain('type="date"');
    expect(financeHtml).toContain("Период:");
    expect(financeHtml).not.toContain("По умолчанию:");
  });

  it("shows custom date inputs when a custom period is selected", () => {
    const materialsHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/materials?period=custom&dateFrom=2026-05-01&dateTo=2026-05-13"]}>
        <MaterialsPage />
      </MemoryRouter>
    );
    expect(materialsHtml).toContain('value="custom"');
    expect(materialsHtml).toContain('type="date"');

    const financeHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/finance?period=custom&dateFrom=2026-05-01&dateTo=2026-05-13"]}>
        <FinancePage />
      </MemoryRouter>
    );
    expect(financeHtml).toContain('value="custom"');
    expect(financeHtml).toContain('type="date"');
  });

  it("renders collapsed documents and inspection blocks by default without helper copy", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <div>
          <OrderDocumentsSection mode="compact" onOpenRegistry={() => undefined} orderId={1} />
          <InspectionOrderSection
            isMobile={false}
            isModernDesktop
            orderId={1}
            orderLabel="Order #1"
            sectionClassName="rounded-2xl border"
            vehicleLabel="Vehicle"
          />
        </div>
      </MemoryRouter>
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Документы свернуты");
    expect(html).not.toContain("Осмотр свернут");
  });

  it("shows material attachments expanded by default in the material detail panel", () => {
    const html = renderToStaticMarkup(<MaterialDetailPanel isMobile={false} materialKey="1" onClose={() => undefined} />);

    expect(html).toContain("Вложения");
    expect(html).toContain("Прикрепить файл");
    expect(html).not.toContain("Показать");
    expect(html).not.toContain("Свернуть");
    expect(html).not.toContain("Список вложений загрузится после раскрытия блока");
    expect(html).not.toContain("Выберите файл");
    expect(html).not.toContain("Файл не выбран");
    expect(html).toContain("invoice.pdf");
  });
});
