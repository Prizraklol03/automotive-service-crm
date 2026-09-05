import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MaterialDetailPanel } from "@/features/materials/ui/material-detail-panel";

let uploadPending = false;
const mountedRoots: Array<{ unmount: () => void }> = [];
let deleteMutationState = {
  isPending: false,
  mutateAsync: vi.fn(async () => {
    deleteMutationState.isPending = true;
    return Promise.resolve();
  })
};
let currentMaterialDetailData = {
  attachments_count: 1,
  expense_date: "2026-05-13",
  id: 1,
  material_name: "Foam",
  quantity: 2,
  row_total: "300.00",
  service_category_id: null,
  service_category_name: null,
  unit_price: "150.00"
};
let attachmentRows = [
  {
    created_at: "2026-05-13T10:00:00",
    created_by_user_id: 1,
    file_name: "invoice.pdf",
    id: 1,
    material_id: 1,
    mime_type: "application/pdf",
    size: 1024,
  }
];

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

vi.mock("@/features/services/api/services-hooks", () => ({
  useServiceCategoriesQuery: () => ({ data: [{ id: 1, name: "Polish" }], isLoading: false })
}));

vi.mock("@/features/materials/api/materials-hooks", () => ({
  downloadMaterialAttachment: vi.fn(),
  useCreateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useDeleteMaterialAttachmentMutation: () => deleteMutationState,
  useDeleteMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useMaterialAttachmentsQuery: () => ({
    data: attachmentRows,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useMaterialDetailQuery: () => ({
    data: currentMaterialDetailData,
    isError: false,
    isLoading: false
  }),
  useUpdateMaterialMutation: () => ({ isError: false, isPending: false, mutateAsync: vi.fn() }),
  useUploadMaterialAttachmentMutation: () => ({
    isPending: uploadPending,
    mutateAsync: vi.fn(async () => undefined)
  })
}));

function mountPanel() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(<MaterialDetailPanel isMobile={false} materialKey="1" onClose={() => undefined} />);
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

afterEach(() => {
  while (mountedRoots.length) {
    const root = mountedRoots.pop();
    if (root) {
      act(() => root.unmount());
    }
  }
});

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) {
    throw new Error("File input not found");
  }

  act(() => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
}

describe("material attachments", () => {
  beforeEach(() => {
    uploadPending = false;
    deleteMutationState = {
      isPending: false,
      mutateAsync: vi.fn(async () => {
        deleteMutationState.isPending = true;
        return Promise.resolve();
      })
    };
    currentMaterialDetailData = {
      attachments_count: 1,
      expense_date: "2026-05-13",
      id: 1,
      material_name: "Foam",
      quantity: 2,
      row_total: "300.00",
      service_category_id: null,
      service_category_name: null,
      unit_price: "150.00"
    };
    attachmentRows = [
      {
        created_at: "2026-05-13T10:00:00",
        created_by_user_id: 1,
        file_name: "invoice.pdf",
        id: 1,
        material_id: 1,
        mime_type: "application/pdf",
        size: 1024,
      }
    ];
    document.body.innerHTML = "";
  });

  it("keeps attachments visible by default without collapse helper text", () => {
    const html = renderToStaticMarkup(<MaterialDetailPanel isMobile={false} materialKey="1" onClose={() => undefined} />);

    expect(html).toContain("Вложения");
    expect(html).toContain("Прикрепить файл");
    expect(html).not.toContain("Всегда открыт");
    expect(html).not.toContain("Список вложений загрузится после раскрытия блока.");
    expect(html).not.toContain("Свернуть");
    expect(html).not.toContain("Развернуть");
  });

  it("shows the selected filename and upload pending state", () => {
    uploadPending = true;
    const { container, unmount } = mountPanel();

    const file = new File(["invoice"], "invoice.pdf", { type: "application/pdf" });
    selectFile(container, file);

    expect(container.textContent).toContain("invoice.pdf");
    expect(container.textContent).toContain("Загружаем вложение...");

    unmount();
  });

  it("shows the delete pending state for an attachment", () => {
    const { container, unmount } = mountPanel();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Удалить")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("Удаляем...");

    confirmSpy.mockRestore();
    unmount();
  });

  it("shows an empty state only after an empty response", () => {
    attachmentRows = [];
    currentMaterialDetailData = {
      attachments_count: 0,
      expense_date: "2026-05-13",
      id: 1,
      material_name: "Foam",
      quantity: 2,
      row_total: "300.00",
      service_category_id: null,
      service_category_name: null,
      unit_price: "150.00"
    };
    const html = renderToStaticMarkup(<MaterialDetailPanel isMobile={false} materialKey="1" onClose={() => undefined} />);

    expect(html).toContain("Пока нет вложений.");
    expect(html).not.toContain("Всегда открыт");
  });
});
