import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import { useInfinitePagedQuery } from "@/shared/hooks/use-infinite-paged-query";

const queryCalls: number[] = [];

const pages = [
  { items: [{ id: 1, name: "One" }], page: 1, page_size: 1, total: 2 },
  { items: [{ id: 2, name: "Two" }], page: 2, page_size: 1, total: 2 }
];

async function waitForCondition(check: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function Harness() {
  const query = useInfinitePagedQuery<{ id: number; name: string }, (typeof pages)[number]>({
    queryKey: ["infinite-scroll-helper"],
    queryFn: async (page) => {
      queryCalls.push(page);
      return pages[page - 1] ?? pages[pages.length - 1];
    }
  });

  return (
    <div>
      <div data-testid="items">{query.items.map((item) => item.name).join(",")}</div>
      <div data-testid="status">
        {query.loadedCount}/{query.total}
      </div>
      <button type="button" onClick={() => void query.fetchNextPage()}>
        load more
      </button>
    </div>
  );
}

function mount(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    async clickLoadMore() {
      const button = container.querySelector("button") as HTMLButtonElement | null;
      if (!button) {
        throw new Error("Load more button not found");
      }
      await act(async () => {
        button.click();
      });
      await waitForCondition(() => container.querySelector('[data-testid="items"]')?.textContent === "One,Two");
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

describe("infinite scroll helper", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    queryCalls.length = 0;
  });

  it("appends next pages instead of replacing existing items", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    const { container, clickLoadMore, unmount } = mount(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    );

    await waitForCondition(() => container.querySelector('[data-testid="items"]')?.textContent === "One");

    expect(container.querySelector('[data-testid="items"]')?.textContent).toBe("One");
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("1/2");
    expect(queryCalls).toEqual([1]);

    await clickLoadMore();

    expect(container.querySelector('[data-testid="items"]')?.textContent).toBe("One,Two");
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("2/2");
    expect(queryCalls).toEqual([1, 2]);

    unmount();
  });
});
