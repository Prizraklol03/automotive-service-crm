import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderPhotoSection } from "@/features/orders/ui/order-photo-section";

const createShareMutation = vi.fn().mockResolvedValue(undefined);
const revokeShareMutation = vi.fn().mockResolvedValue(undefined);
const uploadPhotosMutation = vi.fn().mockResolvedValue(undefined);
const deletePhotoMutation = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  createShareMutation.mockClear();
  revokeShareMutation.mockClear();
  uploadPhotosMutation.mockClear();
  deletePhotoMutation.mockClear();
  document.body.innerHTML = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined
  });
});

vi.mock("@/features/orders/api/order-photos-hooks", () => ({
  useDeletePhotoMutation: () => ({ isPending: false, mutateAsync: deletePhotoMutation }),
  useGenerateShareMutation: () => ({ isPending: false, mutate: createShareMutation }),
  useOrderPhotosQuery: () => ({ data: [], isPending: false }),
  usePhotoObjectUrl: () => ({ data: undefined, isPending: false }),
  useRevokeShareMutation: () => ({ isPending: false, mutate: revokeShareMutation }),
  useShareInfoQuery: () => ({
    data: { share_token: "public-token", share_url: null },
    isPending: false
  }),
  useUploadPhotosMutation: () => ({ isPending: false, mutateAsync: uploadPhotosMutation })
}));

describe("order photo share button", () => {
  it("copies the public link using the fallback clipboard path when the browser clipboard API is unavailable", async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
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
          useDesktopStagePicker={false}
        />
      );
    });

    const openPhotosButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Показать")
    ) as HTMLButtonElement | undefined;

    expect(openPhotosButton).toBeTruthy();

    await act(async () => {
      openPhotosButton?.click();
      await Promise.resolve();
    });

    const openShareButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Показать")
    ) as HTMLButtonElement | undefined;

    expect(openShareButton).toBeTruthy();

    await act(async () => {
      openShareButton?.click();
      await Promise.resolve();
    });

    const copyButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Копировать")
    ) as HTMLButtonElement | undefined;

    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(container.textContent).toContain("Скопировано");

    act(() => {
      root.unmount();
    });
  });
});
