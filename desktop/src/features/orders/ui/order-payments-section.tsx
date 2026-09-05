import { zodResolver } from "@hookform/resolvers/zod";
import { PencilLine, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  useCreateOrderPaymentMutation,
  useDeleteOrderPaymentMutation,
  useOrderPaymentsQuery,
  useUpdateOrderPaymentMutation
} from "@/features/orders/api/order-payments-hooks";
import { cn } from "@/shared/lib/cn";
import { formatCurrency, formatDateTime } from "@/shared/lib/format";
import { getDefaultDateTimeValue, toApiLocalDateTime, toLocalDateTimeInputValue } from "@/shared/lib/datetime";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect } from "@/shared/ui/app-select";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { StatusBadge } from "@/shared/ui/status-badge";
import {
  getOrderPaymentMethodLabel,
  getOrderPaymentStatusLabel,
  getOrderPaymentStatusTone,
  type OrderPayment,
  type OrderPaymentMethod
} from "@/entities/order-payment/model/types";
import type { Order } from "@/entities/order/model/types";

const paymentAmountSchema = z.coerce.number().gt(0, "Сумма платежа должна быть больше 0");

const paymentFormSchema = z.object({
  amount: paymentAmountSchema,
  comment: z.string().max(1000, "Слишком длинный комментарий"),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Некорректная дата и время"),
  payment_method: z.enum(["cash", "card", "transfer", "other"])
});

type PaymentFormValues = {
  amount: unknown;
  comment: string;
  payment_date: string;
  payment_method: OrderPaymentMethod;
};

const PAYMENT_METHOD_OPTIONS: Array<{ label: string; value: OrderPaymentMethod }> = [
  { label: "Наличные", value: "cash" },
  { label: "Карта", value: "card" },
  { label: "Перевод", value: "transfer" },
  { label: "Другое", value: "other" }
];

type PaymentEditorState =
  | { mode: "create" }
  | { mode: "edit"; payment: OrderPayment }
  | null;

function getDefaultPaymentFormValues(): PaymentFormValues {
  return {
    amount: 0,
    comment: "",
    payment_date: getDefaultDateTimeValue(),
    payment_method: "cash"
  };
}

export function getCreatePaymentIdempotencyKey(existingKey: string | null): string {
  return existingKey ?? crypto.randomUUID();
}

export function OrderPaymentsSection({
  isModernDesktop,
  canCreatePayments,
  canEditPayments,
  canDeletePayments,
  order,
  orderId,
  sectionClassName
}: {
  isModernDesktop: boolean;
  canCreatePayments: boolean;
  canEditPayments: boolean;
  canDeletePayments: boolean;
  order: Order;
  orderId: number;
  sectionClassName: string;
}) {
  const [editorState, setEditorState] = useState<PaymentEditorState>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const createKeyRef = useRef<string | null>(null);
  const paymentsQuery = useOrderPaymentsQuery(orderId, order.payments);
  const createMutation = useCreateOrderPaymentMutation(orderId);
  const updateMutation = useUpdateOrderPaymentMutation(orderId);
  const deleteMutation = useDeleteOrderPaymentMutation(orderId);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: getDefaultPaymentFormValues()
  });

  const paymentDateValue = useWatch({ control: form.control, name: "payment_date" }) ?? "";
  const paymentMethodValue = useWatch({ control: form.control, name: "payment_method" }) ?? "cash";

  useEffect(() => {
    if (!editorState) {
      form.reset(getDefaultPaymentFormValues());
      return;
    }

    if (editorState.mode === "create") {
      form.reset(getDefaultPaymentFormValues());
      return;
    }

    form.reset({
      amount: Number(editorState.payment.amount),
      comment: editorState.payment.comment ?? "",
      payment_date: toLocalDateTimeInputValue(editorState.payment.payment_date),
      payment_method: editorState.payment.payment_method
    });
  }, [editorState, form]);

  const payments = paymentsQuery.data ?? [];
  const paymentStatusLabel = getOrderPaymentStatusLabel(order.payment_status);
  const paymentStatusTone = getOrderPaymentStatusTone(order.payment_status);
  const overpaidWarning = order.payment_status === "overpaid";
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const summaryRows = useMemo(
    () => [
      {
        label: "К оплате",
        value: formatCurrency(Number(order.amount_to_pay))
      },
      {
        label: "Оплачено",
        value: formatCurrency(Number(order.paid_total))
      },
      {
        label: "Остаток",
        value: formatCurrency(Number(order.balance_due))
      }
    ],
    [order.amount_to_pay, order.balance_due, order.paid_total]
  );

  const openCreateEditor = () => {
    createKeyRef.current = null;
    setEditorState({ mode: "create" });
    setFeedbackMessage(null);
  };

  const openEditEditor = (payment: OrderPayment) => {
    setEditorState({ mode: "edit", payment });
    setFeedbackMessage(null);
  };

  const closeEditor = () => {
    if (editorState?.mode === "create") {
      createKeyRef.current = null;
    }
    setEditorState(null);
  };

  const savePayment = form.handleSubmit(async (values) => {
    const paymentDate = toApiLocalDateTime(values.payment_date);
    if (!paymentDate) {
      setFeedbackMessage("Не удалось преобразовать дату платежа.");
      return;
    }

    const payload = {
      amount: Number(values.amount).toFixed(2),
      comment: values.comment.trim() ? values.comment.trim() : null,
      payment_date: paymentDate,
      payment_method: values.payment_method
    };

    if (editorState?.mode === "edit") {
      if (!canEditPayments) {
        return;
      }
      await updateMutation.mutateAsync({ paymentId: editorState.payment.id, payload });
      setFeedbackMessage("Платёж изменён");
    } else {
      if (!canCreatePayments) {
        return;
      }
      createKeyRef.current = getCreatePaymentIdempotencyKey(createKeyRef.current);
      await createMutation.mutateAsync({ payload, idempotencyKey: createKeyRef.current });
      createKeyRef.current = null;
      setFeedbackMessage("Платёж добавлен");
    }

    closeEditor();
  });

  const handleDelete = async (paymentId: number) => {
    if (!canDeletePayments) {
      return;
    }
    if (!window.confirm("Удалить платёж?")) {
      return;
    }

    await deleteMutation.mutateAsync(paymentId);
    setFeedbackMessage("Платёж удалён");
    if (editorState?.mode === "edit" && editorState.payment.id === paymentId) {
      closeEditor();
    }
  };

  const handleEditorKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      return;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
      event.preventDefault();
    }
  };

  return (
    <section className={sectionClassName}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Оплаты</h3>
        </div>
        {canCreatePayments ? (
          <AppButton type="button" size="sm" variant="subtle" onClick={openCreateEditor}>
            <Plus className="h-4 w-4" />
            Добавить оплату
          </AppButton>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {summaryRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{row.label}</div>
            <div className="mt-1 text-base font-semibold">{row.value}</div>
          </div>
        ))}
        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Статус оплаты</div>
          <div className="mt-2">
            <StatusBadge label={paymentStatusLabel} tone={paymentStatusTone} />
          </div>
        </div>
      </div>

      {overpaidWarning ? (
        <div className="mt-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          Переплата по заказу: {formatCurrency(Math.abs(Number(order.balance_due)))}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {paymentsQuery.isLoading ? (
          <LoadingState title="Загружаем оплаты" description="Подготавливаем список платежей по заказу." />
        ) : null}

        {paymentsQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить оплаты"
            description="Попробуйте обновить карточку заказа."
            actionLabel="Повторить"
            onAction={() => void paymentsQuery.refetch()}
          />
        ) : null}

        {!paymentsQuery.isLoading && !paymentsQuery.isError && payments.length === 0 ? (
          <div className={cn("px-4 py-6 text-sm text-muted-foreground", isModernDesktop ? "rounded-xl bg-surface-2/50" : "rounded-2xl border border-dashed border-border")}>
            По этому заказу пока нет оплат.
          </div>
        ) : null}

        {!paymentsQuery.isLoading && !paymentsQuery.isError
          ? payments.map((payment) => (
              <div
                key={payment.id}
                className={cn(
                  "rounded-2xl border border-border bg-surface p-4",
                  isModernDesktop ? "bg-surface-3/60" : ""
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold">{formatCurrency(Number(payment.amount))}</div>
                      <StatusBadge label={getOrderPaymentMethodLabel(payment.payment_method)} tone="muted" />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(payment.payment_date)}</div>
                    {payment.comment ? <p className="mt-3 text-sm text-muted-foreground">{payment.comment}</p> : null}
                  </div>
                  {canEditPayments || canDeletePayments ? (
                    <div className="flex flex-wrap gap-2">
                      {canEditPayments ? <AppButton type="button" size="sm" variant="outline" onClick={() => openEditEditor(payment)}>
                        <PencilLine className="h-4 w-4" />
                        Изменить
                      </AppButton> : null}
                      {canDeletePayments ? <AppButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={deleteMutation.isPending || isSaving}
                        onClick={() => void handleDelete(payment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить
                      </AppButton> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          : null}
      </div>

      {editorState ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4" onKeyDownCapture={handleEditorKeyDownCapture}>
          <h4 className="text-sm font-semibold">{editorState.mode === "create" ? "Добавить оплату" : "Изменить оплату"}</h4>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field error={form.formState.errors.amount?.message} label="Сумма, ₽">
              <Controller
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <AppInput
                    inputMode="decimal"
                    min={0}
                    disabled={isSaving}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(event.target.value)}
                    onFocus={() => {
                      if (field.value === 0 || field.value === "0") {
                        field.onChange("");
                      }
                    }}
                    step="0.01"
                    type="number"
                    value={field.value === 0 ? "" : String(field.value ?? "")}
                  />
                )}
              />
            </Field>
            <Field error={form.formState.errors.payment_date?.message} label="Дата оплаты">
              <AppInput
                name="payment_date"
                disabled={isSaving}
                onBlur={() => void form.trigger("payment_date")}
                onChange={(event) =>
                  form.setValue("payment_date", event.target.value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true
                  })
                }
                type="datetime-local"
                value={paymentDateValue}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Способ оплаты" error={form.formState.errors.payment_method?.message}>
              <AppSelect
                disabled={isSaving}
                value={paymentMethodValue}
                onChange={(event) =>
                  form.setValue("payment_method", event.target.value as OrderPaymentMethod, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true
                  })
                }
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </AppSelect>
            </Field>
            <Field label="Комментарий" error={form.formState.errors.comment?.message}>
              <AppTextarea disabled={isSaving} rows={3} placeholder="Комментарий к платежу" {...form.register("comment")} />
            </Field>
          </div>

          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <AppButton type="button" variant="outline" onClick={closeEditor}>
              Отмена
            </AppButton>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <AppButton type="button" disabled={isSaving} onClick={() => void savePayment()}>
                {isSaving ? "Сохраняем..." : editorState.mode === "create" ? "Добавить" : "Сохранить"}
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}

      {feedbackMessage ? (
        <div className="mt-4 rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{feedbackMessage}</div>
      ) : null}

      {createMutation.isError || updateMutation.isError || deleteMutation.isError ? (
        <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {createMutation.error?.message ?? updateMutation.error?.message ?? deleteMutation.error?.message ?? "Не удалось сохранить платёж"}
        </div>
      ) : null}
    </section>
  );
}

function Field({ children, error, label }: { children: ReactNode; error?: string; label: string }) {
  return (
    <div className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
