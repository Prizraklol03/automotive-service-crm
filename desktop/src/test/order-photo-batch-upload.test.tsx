import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderPhotoUploadProgress } from "@/features/orders/api/order-photos-api";
import { OrderPhotoSection } from "@/features/orders/ui/order-photo-section";

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { id: number; role_code: string; permissions: string[] } | null }) => unknown) =>
    selector({ user: { id: 1, role_code: "standard_user", permissions: ["photos.view", "photos.upload"] } })
}));

const uploadPhotosMutation = vi.fn();

vi.mock("@/features/orders/api/order-photos-hooks", () => ({
  useDeletePhotoMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useGenerateShareMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useOrderPhotosQuery: () => ({ data: [], isPending: false }),
  usePhotoObjectUrl: () => ({ data: undefined, isPending: false }),
  useRevokeShareMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useShareInfoQuery: () => ({ data: { share_token: null, share_url: null }, isPending: false }),
  useUploadPhotosMutation: () => ({ isPending: false, mutateAsync: uploadPhotosMutation })
}));

function makeFile(index: number) {
  return new File([`photo-${index}`], `vehicle-${index}.jpg`, { type: "image/jpeg" });
}

beforeEach(() => {
  uploadPhotosMutation.mockReset();
  document.body.innerHTML = "";
});

describe("order photo batch picker", () => {
  it("preserves 13 selected files after clearing the input and reports partial failure", async () => {
    const files = Array.from({ length: 13 }, (_, index) => makeFile(index + 1));
    uploadPhotosMutation.mockResolvedValue({
      failed: [{ error: new Error("invalid"), fileName: files[12]!.name }],
      uploaded: files.slice(0, 12).map((_, index) => ({
        created_at: "2026-08-05T10:00:00",
        filename: `stored-${index + 1}.jpg`,
        id: index + 1,
        order_id: 42,
        sort_order: index,
        stage: "before" as const
      }))
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <OrderPhotoSection
          orderId={42}
          sectionClassName="rounded-2xl border"
          isModernDesktop={false}
          useDesktopStagePicker
        />
      );
    });

    const openButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Показать"));
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const addButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Добавить"));
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const beforeButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "До");
    await act(async () => {
      beforeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const galleryInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[2]!;
    Object.defineProperty(galleryInput, "files", { configurable: true, value: files });

    await act(async () => {
      galleryInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(uploadPhotosMutation).toHaveBeenCalledWith(expect.objectContaining({ files, stage: "before" }));
    expect(galleryInput.value).toBe("");
    expect(container.textContent).toContain("Загружено: 12. Не удалось загрузить: 1.");

    act(() => {
      root.unmount();
    });
  });

  it("shows selected photos progressing from queued to uploaded or failed", async () => {
    const files = [makeFile(1), makeFile(2), makeFile(3)];
    let finishUpload: (() => void) | undefined;

    uploadPhotosMutation.mockImplementation(
      ({ files: selectedFiles, onProgress }: { files: File[]; onProgress: (progress: OrderPhotoUploadProgress) => void }) =>
        new Promise((resolve) => {
          onProgress({ file: selectedFiles[0]!, index: 0, status: "uploading" });
          finishUpload = () => {
            onProgress({ file: selectedFiles[0]!, index: 0, photos: [
              {
                created_at: "2026-08-05T10:00:00",
                filename: "stored-1.jpg",
                id: 1,
                order_id: 42,
                sort_order: 0,
                stage: "before"
              }
            ], status: "uploaded" });
            onProgress({ file: selectedFiles[1]!, index: 1, status: "uploading" });
            onProgress({ error: new Error("invalid"), file: selectedFiles[1]!, index: 1, status: "failed" });
            onProgress({ file: selectedFiles[2]!, index: 2, status: "uploading" });
            resolve({
              failed: [{ error: new Error("invalid"), fileName: selectedFiles[1]!.name }],
              uploaded: [
                {
                  created_at: "2026-08-05T10:00:00",
                  filename: "stored-1.jpg",
                  id: 1,
                  order_id: 42,
                  sort_order: 0,
                  stage: "before"
                }
              ]
            });
          };
        })
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <OrderPhotoSection
          orderId={42}
          sectionClassName="rounded-2xl border"
          isModernDesktop={false}
          useDesktopStagePicker
        />
      );
    });

    const openButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Показать"));
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const addButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Добавить"));
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const beforeButton = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "До");
    await act(async () => {
      beforeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const galleryInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[2]!;
    Object.defineProperty(galleryInput, "files", { configurable: true, value: files });
    await act(async () => {
      galleryInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    const progress = container.querySelector('[data-testid="order-photo-upload-progress"]');
    expect(progress?.getAttribute("role")).toBe("status");
    expect(progress?.textContent).toContain("Загрузка фото");
    expect(progress?.textContent).toContain("vehicle-1.jpg");
    expect(progress?.textContent).toContain("Загружается");
    expect(progress?.textContent).toContain("В очереди");

    await act(async () => {
      finishUpload?.();
      await Promise.resolve();
    });

    expect(progress?.textContent).toContain("Загружено");
    expect(progress?.textContent).toContain("Ошибка");

    act(() => {
      root.unmount();
    });
  });
});
