import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinanceExpenseAttachmentsSection } from "@/features/finance/ui/finance-expense-attachments";

let uploadPending = false;
const mountedRoots: Array<{ unmount: () => void }> = [];
const { downloadAttachmentSpy } = vi.hoisted(() => ({
  downloadAttachmentSpy: vi.fn(async () => ({
    blob: new Blob(["receipt"], { type: "application/pdf" }),
    contentType: "application/pdf",
    filename: "receipt.pdf"
  }))
}));
let deleteMutationState = {
  isPending: false,
  mutateAsync: vi.fn(async () => {
    deleteMutationState.isPending = true;
    return Promise.resolve();
  })
};
let attachmentRows = [
  {
    created_at: "2026-06-24T10:00:00",
    created_by_user_id: 1,
    expense_id: 1,
    file_name: "receipt.pdf",
    id: 1,
    mime_type: "application/pdf",
    size: 1024,
  }
];

vi.mock("@/features/finance/api/finance-hooks", () => ({
  downloadFinanceExpenseAttachment: downloadAttachmentSpy,
  useDeleteFinanceExpenseAttachmentMutation: () => deleteMutationState,
  useFinanceExpenseAttachmentsQuery: () => ({
    data: attachmentRows,
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useUploadFinanceExpenseAttachmentMutation: () => ({
    isPending: uploadPending,
    mutateAsync: vi.fn(async () => undefined)
  })
}));

function mountSection(canManage: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(<FinanceExpenseAttachmentsSection canManage={canManage} expenseId={1} />);
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

describe("finance expense attachments", () => {
  beforeEach(() => {
    uploadPending = false;
    downloadAttachmentSpy.mockClear();
    deleteMutationState = {
      isPending: false,
      mutateAsync: vi.fn(async () => {
        deleteMutationState.isPending = true;
        return Promise.resolve();
      })
    };
    attachmentRows = [
      {
        created_at: "2026-06-24T10:00:00",
        created_by_user_id: 1,
        expense_id: 1,
        file_name: "receipt.pdf",
        id: 1,
        mime_type: "application/pdf",
        size: 1024,
      }
    ];
    document.body.innerHTML = "";
  });

  it("hides upload and delete controls without manage permission", () => {
    const html = renderToStaticMarkup(<FinanceExpenseAttachmentsSection canManage={false} expenseId={1} />);

    expect(html).toContain("Вложения");
    expect(html).toContain("receipt.pdf");
    expect(html).toContain("Скачать");
    expect(html).not.toContain("Прикрепить файл");
    expect(html).not.toContain("Удалить");
  });

  it("shows the selected filename and upload pending state", () => {
    uploadPending = true;
    const { container, unmount } = mountSection(true);

    const file = new File(["receipt"], "receipt.pdf", { type: "application/pdf" });
    selectFile(container, file);

    expect(container.textContent).toContain("receipt.pdf");
    expect(container.textContent).toContain("Загружаем вложение...");

    unmount();
  });

  it("shows the delete pending state for an attachment", () => {
    const { container, unmount } = mountSection(true);
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

  it("downloads an attachment when the download action is clicked", async () => {
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

    const { container, unmount } = mountSection(true);

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Скачать")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(downloadAttachmentSpy).toHaveBeenCalledWith(1, 1);

    unmount();
  });
});
