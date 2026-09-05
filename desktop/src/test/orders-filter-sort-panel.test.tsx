import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/mobile-sheet", () => ({
  MobileSheet: ({ children }: { children: React.ReactNode }) => <div data-testid="mobile-sheet">{children}</div>
}));

import { DEFAULT_ORDER_SORTS } from "@/features/orders/model/order-sorting";
import { OrdersFilterSortPanel } from "@/features/orders/ui/orders-filter-sort-panel";

const mounted: Array<{ container: HTMLDivElement; root: ReturnType<typeof createRoot> }> = [];

function mountPanel(overrides: Partial<React.ComponentProps<typeof OrdersFilterSortPanel>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: React.ComponentProps<typeof OrdersFilterSortPanel> = {
    filters: {},
    isSavingDefault: false,
    onApply: vi.fn(),
    onClose: vi.fn(),
    onSaveDefault: vi.fn(),
    saveDefaultError: null,
    sortDescriptors: DEFAULT_ORDER_SORTS,
    ...overrides
  };
  act(() => root.render(<OrdersFilterSortPanel {...props} />));
  mounted.push({ container, root });
  return { container, props };
}

function clickByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  expect(button).toBeDefined();
  act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

afterEach(() => {
  mounted.splice(0).forEach(({ container, root }) => {
    act(() => root.unmount());
    container.remove();
  });
});

describe("OrdersFilterSortPanel", () => {
  it("shows every sorting field and applies quick sorting with additional filters", () => {
    const onApply = vi.fn();
    const { container } = mountPanel({ onApply });

    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches).toHaveLength(9);
    expect(container.querySelector(`#${switches[0]?.getAttribute("aria-labelledby")}`)?.textContent).toBe("Статус");
    clickByText(container, "По модели");

    const paid = container.querySelector('input[aria-label="Оплачено"]') as HTMLInputElement;
    act(() => paid.click());
    const client = Array.from(container.querySelectorAll("input")).find((input) => input.getAttribute("placeholder") === "ФИО или телефон") as HTMLInputElement;
    setInput(client, "Анна");
    clickByText(container, "Применить");

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ client: "Анна", paymentStatus: ["paid"] }),
      [{ key: "vehicle_model", direction: "asc" }]
    );
  });

  it("saves the current prioritized sorting and can restore the system default", () => {
    const onSaveDefault = vi.fn();
    const customSorts = [
      { key: "amount_to_pay", direction: "desc" },
      { key: "client_full_name", direction: "asc" }
    ] as const;
    const { container } = mountPanel({ onSaveDefault, sortDescriptors: [...customSorts] });

    clickByText(container, "Сохранить по умолчанию");
    expect(onSaveDefault).toHaveBeenLastCalledWith(customSorts);

    clickByText(container, "Сбросить к системной");
    expect(onSaveDefault).toHaveBeenLastCalledWith(DEFAULT_ORDER_SORTS);
  });
});
