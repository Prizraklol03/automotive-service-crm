import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAnalyticsWorkingMonthRange } from "@/shared/lib/analytics-period";

const mocks = vi.hoisted(() => ({
  financeExpenseFilters: [] as Array<{ dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }>,
  financeSummaryFilters: [] as Array<{ dateFrom?: string; dateTo?: string }>,
  materialsPageFilters: [] as Array<{ dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }>,
  materialsSummaryFilters: [] as Array<{ dateFrom?: string; dateTo?: string }>,
  visualConfig: { accent_hue: null, preset: null, status_colors: null, ui_density: null, working_month_start_day: 25 }
}));

const currentAuthUser = { id: 1, permissions: [] as string[], role_code: "standard_user" as const };

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: typeof currentAuthUser | null }) => unknown) => selector({ user: currentAuthUser })
}));

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useVisualConfigQuery: () => ({
    data: mocks.visualConfig,
    isError: false,
    isLoading: false
  })
}));

vi.mock("@/features/materials/api/materials-hooks", () => ({
  useCreateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialAttachmentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useMaterialAttachmentsQuery: () => ({ data: [], isError: false, isLoading: false }),
  useMaterialDetailQuery: () => ({ data: null, isError: false, isLoading: false }),
  useMaterialsInfiniteQuery: vi.fn((filters: { dateFrom?: string; dateTo?: string; pageSize: number } = { pageSize: 50 }) => {
    mocks.materialsPageFilters.push(filters);
    return {
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
        page_size: filters.pageSize,
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
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isLoading: false,
      loadedCount: 1,
      total: 1,
      refetch: vi.fn()
    };
  }),
  useMaterialsSummaryQuery: vi.fn((filters: { dateFrom?: string; dateTo?: string } = {}) => {
    mocks.materialsSummaryFilters.push(filters);
    return {
      data: {
        categories: [],
        total_amount: 300
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn()
    };
  }),
  useMaterialsQuery: vi.fn((filters: { dateFrom?: string; dateTo?: string } = {}) => {
    mocks.materialsPageFilters.push(filters);
    return {
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
      isFetching: false,
      isLoading: false,
      refetch: vi.fn()
    };
  }),
  useUpdateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUploadMaterialAttachmentMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [{ id: 1, name: "Polish" }] })
}));

vi.mock("@/features/materials/ui/material-detail-panel", () => ({
  MaterialDetailPanel: () => null
}));

vi.mock("@/features/finance/api/finance-hooks", () => ({
  useCreateFinanceCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateFinanceExpenseMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteFinanceCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteFinanceExpenseMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useFinanceCategoriesQuery: () => ({ data: [{ id: 1, name: "Other" }], isError: false, isLoading: false }),
  useFinanceExpenseDetailQuery: () => ({ data: null, isError: false, isLoading: false }),
  useFinanceExpensesInfiniteQuery: vi.fn((filters: { dateFrom?: string; dateTo?: string; pageSize: number } = { pageSize: 50 }) => {
    mocks.financeExpenseFilters.push(filters);
    return {
      data: {
        items: [{ amount: "500.00", category_name: "Other", comment: "Stationery", expense_date: "2026-05-13", id: 1 }],
        page: 1,
        page_size: filters.pageSize,
        total: 1
      },
      items: [{ amount: "500.00", category_name: "Other", comment: "Stationery", expense_date: "2026-05-13", id: 1 }],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isLoading: false,
      loadedCount: 1,
      total: 1,
      refetch: vi.fn()
    };
  }),
  useFinanceSummaryQuery: vi.fn((filters: { dateFrom?: string; dateTo?: string } = {}) => {
    mocks.financeSummaryFilters.push(filters);
    return {
      data: { total_amount: 500 },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn()
    };
  }),
  useFinanceExpensesQuery: vi.fn((filters: { dateFrom?: string; dateTo?: string } = {}) => {
    mocks.financeExpenseFilters.push(filters);
    return {
      data: [{ amount: "500.00", category_name: "Other", comment: "Stationery", expense_date: "2026-05-13", id: 1 }],
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn()
    };
  }),
  useUpdateFinanceCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateFinanceExpenseMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/finance/ui/finance-categories-modal", () => ({
  FinanceCategoriesModal: () => null
}));

vi.mock("@/features/finance/ui/finance-expense-modal", () => ({
  FinanceExpenseModal: () => null
}));

import { FinancePage } from "@/pages/finance-page";
import { MaterialsPage } from "@/pages/materials-page";

function mount(ui: ReactElement) {
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

function setSelectValue(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
}

function setDateValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
}

describe("materials and finance period filters", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    currentAuthUser.permissions = [];
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
    mocks.materialsPageFilters.length = 0;
    mocks.materialsSummaryFilters.length = 0;
    mocks.financeExpenseFilters.length = 0;
    mocks.financeSummaryFilters.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches the analytics period pattern for materials", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/materials"]}>
        <MaterialsPage />
      </MemoryRouter>
    );

    const expectedDefault = getAnalyticsWorkingMonthRange(new Date(), 25);
    const select = container.querySelector("select") as HTMLSelectElement | null;
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    const resetButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Сбросить"));

    expect(select?.value).toBe("working_month");
    expect(container.innerHTML).toContain("Период:");
    expect(container.innerHTML).not.toContain("По умолчанию:");
    expect(container.innerHTML).not.toContain("Страница 1 из");
    expect(dateInputs).toHaveLength(2);
    expect(resetButton?.className ?? "").not.toContain("w-full");
    expect(mocks.materialsPageFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo,
      pageSize: 50
    });
    expect(mocks.materialsSummaryFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo
    });

    setSelectValue(select as HTMLSelectElement, "custom");
    setDateValue(dateInputs[0] as HTMLInputElement, "2026-05-01");

    expect(select?.value).toBe("custom");
    expect(mocks.materialsPageFilters.at(-1)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: expectedDefault.dateTo,
      pageSize: 50
    });
    expect(mocks.materialsSummaryFilters.at(-1)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: expectedDefault.dateTo
    });

    setDateValue(dateInputs[1] as HTMLInputElement, "2026-05-13");
    expect(mocks.materialsPageFilters.at(-1)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-13",
      pageSize: 50
    });
    expect(mocks.materialsSummaryFilters.at(-1)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-13"
    });

    act(() => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect((container.querySelector("select") as HTMLSelectElement | null)?.value).toBe("working_month");
    expect(mocks.materialsPageFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo,
      pageSize: 50
    });
    expect(mocks.materialsSummaryFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo
    });

    unmount();
  });

  it("matches the analytics period pattern for finance", () => {
    const { container, unmount } = mount(
      <MemoryRouter initialEntries={["/finance"]}>
        <FinancePage />
      </MemoryRouter>
    );

    const expectedDefault = getAnalyticsWorkingMonthRange(new Date(), 25);
    const select = container.querySelector("select") as HTMLSelectElement | null;
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    const resetButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Сбросить"));

    expect(select?.value).toBe("working_month");
    expect(container.innerHTML).toContain("Период:");
    expect(container.innerHTML).not.toContain("По умолчанию:");
    expect(container.innerHTML).not.toContain("Страница 1 из");
    expect(dateInputs).toHaveLength(2);
    expect(resetButton?.className ?? "").not.toContain("w-full");
    expect(mocks.financeExpenseFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo,
      pageSize: 50
    });
    expect(mocks.financeSummaryFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo
    });

    setSelectValue(select as HTMLSelectElement, "custom");
    setDateValue(dateInputs[0] as HTMLInputElement, "2026-05-01");
    setDateValue(dateInputs[1] as HTMLInputElement, "2026-05-13");

    expect(select?.value).toBe("custom");
    expect(mocks.financeExpenseFilters.at(-1)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-13",
      pageSize: 50
    });
    expect(mocks.financeSummaryFilters.at(-1)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-13"
    });

    act(() => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect((container.querySelector("select") as HTMLSelectElement | null)?.value).toBe("working_month");
    expect(mocks.financeExpenseFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo,
      pageSize: 50
    });
    expect(mocks.financeSummaryFilters.at(-1)).toEqual({
      dateFrom: expectedDefault.dateFrom,
      dateTo: expectedDefault.dateTo
    });

    unmount();
  });

  it("hides finance and materials create actions when the user lacks the matching permissions", () => {
    currentAuthUser.permissions = [];

    const financeHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/finance"]}>
        <FinancePage />
      </MemoryRouter>
    );
    const materialsHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/materials"]}>
        <MaterialsPage />
      </MemoryRouter>
    );

    expect(financeHtml).not.toContain("Добавить финансовый расход");
    expect(materialsHtml).not.toContain("Добавить материал");
  });
});
