import { act, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { REMINDER_STATUS_LABELS, getReminderStatusLabel, getReminderStatusTone } from "@/entities/notification/model/presentation";
import type { Order } from "@/entities/order/model/types";
import { getCreatePaymentIdempotencyKey, OrderPaymentsSection } from "@/features/orders/ui/order-payments-section";

const createOrderPaymentMutation = vi.fn().mockResolvedValue(undefined);
const updateOrderPaymentMutation = vi.fn().mockResolvedValue(undefined);
const deleteOrderPaymentMutation = vi.fn().mockResolvedValue(undefined);
const initialPayment = {
  amount: "1000.00",
  comment: "Аванс",
  created_at: "2026-05-13T10:00:00",
  created_by_user_id: 1,
  id: 1,
  order_id: 42,
  payment_date: "2026-05-13T10:00:00",
  payment_method: "cash",
  updated_at: "2026-05-13T10:00:00"
};

beforeEach(() => {
  createOrderPaymentMutation.mockClear();
  updateOrderPaymentMutation.mockClear();
  deleteOrderPaymentMutation.mockClear();
  document.body.innerHTML = "";
});

vi.mock("@/features/orders/api/order-payments-hooks", () => ({
  useCreateOrderPaymentMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: createOrderPaymentMutation }),
  useDeleteOrderPaymentMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: deleteOrderPaymentMutation }),
  useOrderPaymentsQuery: (_orderId: number | null, initialPayments?: typeof initialPayment[]) => ({
    data: initialPayments ?? [],
    isError: false,
    isLoading: false,
    refetch: vi.fn()
  }),
  useUpdateOrderPaymentMutation: () => ({ error: null, isError: false, isPending: false, mutateAsync: updateOrderPaymentMutation })
}));

function order(overrides: Partial<Order> = {}): Order {
  return {
    amount_to_pay: "2500.00",
    balance_due: "-500.00",
    client_summary: {
      full_name: "Тестовый Клиент 02",
      id: 1,
      phone_display: "+7 (000) 000-00-01"
    },
    client_id: 1,
    comment: null,
    completed_at: null,
    due_date: null,
    scheduled_for: null,
    handover_at: null,
    discount_type: "fixed",
    discount_value: "0.00",
    id: 42,
    is_archived: false,
    paid_total: "3000.00",
    payment_status: "overpaid",
    payments: [initialPayment],
    services: [],
    services_total: "2500.00",
    status: "in_progress",
    status_display_name: "В работе",
    status_group: "in_progress",
    status_color: "#3b82f6",
    status_history: [],
    vehicle_summary: {
      brand: "Lada",
      client_id: 1,
      display_name: "A777AA00 · Lada Vesta",
      id: 7,
      model: "Vesta",
      plate_number_display: "A777AA00",
      vin: "VIN777"
    },
    vehicle_id: 7,
    ...overrides
  };
}

describe("order payments section", () => {
  it("reuses the idempotency key for retry and generates a fresh key for a new submit", () => {
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("payment-key-1").mockReturnValueOnce("payment-key-2");

    expect(getCreatePaymentIdempotencyKey(null)).toBe("payment-key-1");
    expect(getCreatePaymentIdempotencyKey("payment-key-1")).toBe("payment-key-1");
    expect(getCreatePaymentIdempotencyKey(null)).toBe("payment-key-2");
    expect(randomUuid).toHaveBeenCalledTimes(2);
    randomUuid.mockRestore();
  });

  it("renders payment totals, status and overpayment warning", () => {
    const html = renderToStaticMarkup(
      <OrderPaymentsSection
        canCreatePayments={true}
        canEditPayments={true}
        canDeletePayments={true}
        isModernDesktop={false}
        order={order()}
        orderId={42}
        sectionClassName="rounded-2xl border"
      />
    );

    expect(html).toContain("Оплаты");
    expect(html).toContain("К оплате");
    expect(html).toContain("Оплачено");
    expect(html).toContain("Остаток");
    expect(html).toContain("Статус оплаты");
    expect(html).toContain("Переплата");
    expect(html).toContain("Наличные");
  });

  it("does not render a nested form and keeps payment actions out of the parent submit flow", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <form onSubmit={onSubmit}>
          <OrderPaymentsSection
            canCreatePayments={true}
            canEditPayments={true}
            canDeletePayments={true}
            isModernDesktop={false}
            order={order({ balance_due: "2500.00", paid_total: "0.00", payment_status: "unpaid" })}
            orderId={42}
            sectionClassName="rounded-2xl border"
          />
        </form>
      );
    });

    expect(container.querySelectorAll("form")).toHaveLength(1);

    const clickButton = (label: string) => {
      const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
      if (!button) {
        throw new Error(`Button not found: ${label}`);
      }
      return button as HTMLButtonElement;
    };

    act(() => {
      clickButton("Добавить оплату").click();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(amountInput).not.toBeNull();
    if (!amountInput) {
      throw new Error("Amount input not found");
    }

    act(() => {
      amountInput.focus();
    });

    expect(amountInput.value).toBe("");

    expect(clickButton("Добавить").type).toBe("button");
    expect(clickButton("Отмена").type).toBe("button");
    expect(clickButton("Изменить").type).toBe("button");
    expect(clickButton("Удалить").type).toBe("button");

    act(() => {
      amountInput.value = "123.45";
      amountInput.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      amountInput.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    });

    act(() => {
      clickButton("Добавить").click();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelectorAll("form")).toHaveLength(1);

    act(() => {
      root.unmount();
    });
  });

  it("hides payment controls when the user cannot manage payments", () => {
    const html = renderToStaticMarkup(
      <OrderPaymentsSection
        canCreatePayments={false}
        canEditPayments={false}
        canDeletePayments={false}
        isModernDesktop={false}
        order={order()}
        orderId={42}
        sectionClassName="rounded-2xl border"
      />
    );

    expect(html).not.toContain("Добавить оплату");
    expect(html).not.toContain("Изменить");
    expect(html).not.toContain("Удалить");
  });

  it("separates create, edit and delete controls by permission", () => {
    const createOnly = renderToStaticMarkup(
      <OrderPaymentsSection
        canCreatePayments={true}
        canDeletePayments={false}
        canEditPayments={false}
        isModernDesktop={false}
        order={order()}
        orderId={42}
        sectionClassName="rounded-2xl border"
      />
    );
    const deleteOnly = renderToStaticMarkup(
      <OrderPaymentsSection
        canCreatePayments={false}
        canDeletePayments={true}
        canEditPayments={false}
        isModernDesktop={false}
        order={order()}
        orderId={42}
        sectionClassName="rounded-2xl border"
      />
    );

    expect(createOnly).toContain("Добавить оплату");
    expect(createOnly).not.toContain("Изменить");
    expect(createOnly).not.toContain("Удалить");
    expect(deleteOnly).not.toContain("Добавить оплату");
    expect(deleteOnly).not.toContain("Изменить");
    expect(deleteOnly).toContain("Удалить");
  });
});

describe("reminder presentation", () => {
  it("does not expose deleted reminder status in active labels", () => {
    expect(REMINDER_STATUS_LABELS).not.toHaveProperty("deleted");
    expect(getReminderStatusLabel("expired")).toBe("Просрочено");
    expect(getReminderStatusTone("expired")).toBe("warning");
  });
});
