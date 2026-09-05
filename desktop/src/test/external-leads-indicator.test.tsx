import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExternalLeadsIndicator } from "@/features/external-leads/ui/external-leads-indicator";

const summaryState: {
  data: { inWorkCount: number; newCount: number; totalOpenCount: number } | undefined;
  isError: boolean;
  isLoading: boolean;
} = {
  data: { inWorkCount: 0, newCount: 0, totalOpenCount: 0 },
  isError: false,
  isLoading: false
};

vi.mock("@/features/external-leads/api/external-leads-hooks", () => ({
  useExternalLeadSummaryQuery: () => summaryState
}));

describe("ExternalLeadsIndicator", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderIndicator() {
    const queryClient = new QueryClient();
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ExternalLeadsIndicator />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  }

  it("renders neutral state when there are no new leads", () => {
    summaryState.data = { inWorkCount: 1, newCount: 0, totalOpenCount: 1 };
    summaryState.isError = false;
    summaryState.isLoading = false;

    renderIndicator();

    const link = container.querySelector("a");
    expect(link?.textContent).toContain("Новые заявки: 0");
    expect(link?.getAttribute("href")).toBe("/integrations/external-leads?status=new");
  });

  it("renders highlighted state when there are new leads", () => {
    summaryState.data = { inWorkCount: 1, newCount: 4, totalOpenCount: 5 };
    summaryState.isError = false;
    summaryState.isLoading = false;

    renderIndicator();

    const link = container.querySelector("a");
    expect(link?.textContent).toContain("Новые заявки: 4");
    expect(link?.className).toContain("border-warning");
  });

  it("falls back to neutral placeholder on error", () => {
    summaryState.data = undefined;
    summaryState.isError = true;
    summaryState.isLoading = false;

    renderIndicator();

    expect(container.querySelector("a")?.textContent).toContain("—");
  });
});
