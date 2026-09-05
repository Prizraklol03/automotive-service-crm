import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InspectionOrderSection } from "@/features/inspection/ui/inspection-order-section";
import { OrderDocumentsSection } from "@/features/documents/ui/order-documents-section";
import { OrderPhotoSection } from "@/features/orders/ui/order-photo-section";

const useOrderDocumentsQueryMock = vi.fn();
const useOrderDetailQueryMock = vi.fn();
const useCurrentInspectionSessionQueryMock = vi.fn();
const useInspectionHistoryQueryMock = vi.fn();
const useOrderPhotosQueryMock = vi.fn();
const usePhotoObjectUrlMock = vi.fn();

beforeEach(() => {
  document.body.innerHTML = "";
  useOrderDocumentsQueryMock.mockReset();
  useOrderDetailQueryMock.mockReset();
  useCurrentInspectionSessionQueryMock.mockReset();
  useInspectionHistoryQueryMock.mockReset();
  useOrderPhotosQueryMock.mockReset();
  usePhotoObjectUrlMock.mockReset();

  useOrderDocumentsQueryMock.mockReturnValue({ data: [], isError: false, isLoading: false, refetch: vi.fn() });
  useOrderDetailQueryMock.mockReturnValue({ data: { completed_at: null, status_history: [] }, isError: false, isLoading: false, refetch: vi.fn() });
  useCurrentInspectionSessionQueryMock.mockReturnValue({ data: null, isError: false, isLoading: false, refetch: vi.fn() });
  useInspectionHistoryQueryMock.mockReturnValue({ data: [], isError: false, isLoading: false, refetch: vi.fn() });
  useOrderPhotosQueryMock.mockReturnValue({
    data: [
      { filename: "first.jpg", id: 1, stage: "general", sort_key: 0 },
      { filename: "second.jpg", id: 2, stage: "general", sort_key: 1 }
    ],
    isError: false,
    isPending: false,
    refetch: vi.fn()
  });
  usePhotoObjectUrlMock.mockReturnValue({ data: undefined, error: null, isPending: false });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
  });
});

vi.mock("@/features/documents/api/documents-hooks", () => ({
  useEnsureOrderDocumentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useOrderDocumentsQuery: (...args: unknown[]) => useOrderDocumentsQueryMock(...args),
  useUpdateDocumentWorkDatesMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/orders/api/orders-hooks", () => ({
  useOrderDetailQuery: (...args: unknown[]) => useOrderDetailQueryMock(...args)
}));

vi.mock("@/features/inspection/api/inspection-hooks", () => ({
  useConfirmInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateInspectionMarkMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteInspectionGeneralPhotoMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteInspectionMarkMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCompleteInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useInspectionGeneralPhotoObjectUrl: () => ({ data: undefined, isPending: false }),
  useCurrentInspectionSessionQuery: (...args: unknown[]) => useCurrentInspectionSessionQueryMock(...args),
  useInspectionHistoryQuery: (...args: unknown[]) => useInspectionHistoryQueryMock(...args),
  useGenerateInspectionActMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useLockInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useReopenInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUploadInspectionGeneralPhotosMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateInspectionMarkMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useStartInspectionSessionMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/features/orders/api/order-photos-hooks", () => ({
  useDeletePhotoMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useGenerateShareMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useOrderPhotosQuery: (...args: unknown[]) => useOrderPhotosQueryMock(...args),
  usePhotoObjectUrl: (...args: unknown[]) => usePhotoObjectUrlMock(...args),
  useRevokeShareMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useShareInfoQuery: () => ({ data: { share_token: "token", share_url: "https://share.example.invalid" }, isPending: false }),
  useUploadPhotosMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/shared/hooks/use-scoped-boolean-preference", () => ({
  useScopedBooleanPreference: () => ({
    setValue: vi.fn(),
    value: false
  })
}));

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { role_code: string } | null }) => unknown) =>
    selector({ user: { role_code: "standard_user" } })
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

describe("order detail lazy sections", () => {
  it("loads the documents section eagerly since it's no longer collapsible", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OrderDocumentsSection orderId={42} />);
      await Promise.resolve();
    });

    expect(useOrderDocumentsQueryMock).toHaveBeenCalledWith(42);
    expect(useOrderDetailQueryMock).toHaveBeenCalledWith(42);

    act(() => {
      root.unmount();
    });
  });

  it("keeps collapsed inspection section from firing session queries on first render", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <InspectionOrderSection
          isMobile={false}
          isModernDesktop={false}
          orderId={42}
          orderLabel="Заказ #42"
          sectionClassName="rounded-2xl border"
          vehicleLabel="A123BC"
        />
      );
      await Promise.resolve();
    });

    expect(useCurrentInspectionSessionQueryMock).toHaveBeenCalledWith(42, false);

    act(() => {
      root.unmount();
    });
  });

  it("does not fetch photo blobs before thumbnails become visible", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <OrderPhotoSection
          isModernDesktop={false}
          orderId={42}
          sectionClassName="rounded-2xl border"
          useDesktopStagePicker={false}
        />
      );
      await Promise.resolve();
    });

    expect(useOrderPhotosQueryMock).toHaveBeenCalledWith(42, false);
    expect(usePhotoObjectUrlMock.mock.calls.every((call) => call[3] === false)).toBe(true);

    act(() => {
      root.unmount();
    });
  });
});
