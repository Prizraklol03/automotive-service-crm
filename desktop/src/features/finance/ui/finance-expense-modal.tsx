import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Trash2, X } from "lucide-react";
import { z } from "zod";

import { useCan } from "@/features/auth/model/permissions";
import {
  useCreateFinanceExpenseMutation,
  useDeleteFinanceExpenseMutation,
  useFinanceCategoriesQuery,
  useFinanceExpenseDetailQuery,
  useUpdateFinanceExpenseMutation
} from "@/features/finance/api/finance-hooks";
import { FinanceExpenseAttachmentsSection } from "@/features/finance/ui/finance-expense-attachments";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { cn } from "@/shared/lib/cn";
import { formatCurrency } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect } from "@/shared/ui/app-select";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { UnsavedChangesBanner } from "@/shared/ui/unsaved-changes-banner";

const formSchema = z.object({
  amount: z.number().min(1, "Сумма должна быть больше 0"),
  category_id: z.number().int().min(1, "Выберите категорию"),
  comment: z.string().max(1000, "Слишком длинный комментарий"),
  expense_date: z.string().min(1, "Выберите дату")
});

type FormValues = z.infer<typeof formSchema>;

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function FinanceExpenseModal({
  expenseKey,
  isMobile,
  onClose
}: {
  expenseKey: string | null;
  isMobile: boolean;
  onClose: () => void;
}) {
  const expenseId = expenseKey && expenseKey !== "new" ? Number(expenseKey) : null;
  const isCreateMode = expenseKey === "new";
  const detailQuery = useFinanceExpenseDetailQuery(expenseId);
  const categoriesQuery = useFinanceCategoriesQuery();
  const createMutation = useCreateFinanceExpenseMutation();
  const updateMutation = useUpdateFinanceExpenseMutation();
  const deleteMutation = useDeleteFinanceExpenseMutation();
  const canCreateExpense = useCan("finance.expenses.create");
  const canEditDeleteExpense = useCan("finance.expenses.edit_delete");
  const canManageExpenseAttachments = canEditDeleteExpense;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 1,
      category_id: 0,
      comment: "",
      expense_date: todayValue()
    }
  });

  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(form.formState.isDirty, onClose);

  useOverlayMode(Boolean(expenseKey), requestClose);

  const expenseDate = useWatch({ control: form.control, name: "expense_date" }) ?? "";

  useEffect(() => {
    const firstCategoryId = categoriesQuery.data?.[0]?.id ?? 0;

    if (isCreateMode) {
      form.reset({
        amount: 1,
        category_id: firstCategoryId,
        comment: "",
        expense_date: todayValue()
      });
      return;
    }

    if (detailQuery.data) {
      form.reset({
        amount: Number(detailQuery.data.amount),
        category_id: detailQuery.data.category_id,
        comment: detailQuery.data.comment,
        expense_date: detailQuery.data.expense_date
      });
    }
  }, [categoriesQuery.data, detailQuery.data, form, isCreateMode]);

  if (!expenseKey) {
    return null;
  }

  const content = (
    <aside
      className={cn(
        "z-50 flex flex-col overflow-hidden bg-background shadow-panel",
        isMobile
          ? "fixed inset-0 h-svh w-full"
          : "fixed left-1/2 top-1/2 hidden max-h-[min(920px,calc(100svh-2rem))] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex"
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Финансы</p>
          <h2 className="mt-1 text-lg font-semibold">{isCreateMode ? "Добавить финансовый расход" : "Редактировать финансовый расход"}</h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть форму финансов">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      {!isCreateMode && (detailQuery.isLoading || detailQuery.isError) ? (
        <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
          {detailQuery.isLoading ? (
            <LoadingState title="Загружаем расход" description="Подготавливаем запись для редактирования." />
          ) : (
            <ErrorState
              title="Не удалось загрузить расход"
              description="Попробуйте открыть запись ещё раз."
              actionLabel="Повторить"
              onAction={() => void detailQuery.refetch()}
            />
          )}
        </div>
      ) : null}

      {isCreateMode || detailQuery.data ? (
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={form.handleSubmit(async (values) => {
            const payload = {
              amount: values.amount.toFixed(2),
              category_id: values.category_id,
              comment: values.comment.trim(),
              expense_date: values.expense_date
            };

            if (isCreateMode) {
              await createMutation.mutateAsync(payload);
            } else if (expenseId) {
              await updateMutation.mutateAsync({ expenseId, payload });
            }

            onClose();
          })}
        >
          <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field error={form.formState.errors.category_id?.message} label="Категория">
                <AppSelect
                  value={form.watch("category_id") || ""}
                  onChange={(event) =>
                    form.setValue("category_id", Number(event.target.value), {
                      shouldDirty: true,
                      shouldValidate: true
                    })
                  }
                >
                  <option value="" disabled>
                    Выберите категорию
                  </option>
                  {(categoriesQuery.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </AppSelect>
              </Field>

              <Field error={form.formState.errors.expense_date?.message} label="Дата">
                <AppInput
                  name="expense_date"
                  onBlur={() => void form.trigger("expense_date")}
                  onChange={(event) =>
                    form.setValue("expense_date", event.target.value, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true
                    })
                  }
                  type="date"
                  value={expenseDate}
                />
              </Field>
            </div>

            <Field error={form.formState.errors.amount?.message} label="Сумма, ₽">
              <AppInput type="number" min={1} step="1" {...form.register("amount", { valueAsNumber: true })} />
            </Field>

            <Field error={form.formState.errors.comment?.message} label="Комментарий">
              <AppTextarea placeholder="Например: аванс мастеру, закупка расходников, кофе для зоны ожидания" {...form.register("comment")} />
            </Field>

            {!isCreateMode && expenseId ? (
              <FinanceExpenseAttachmentsSection canManage={canManageExpenseAttachments} expenseId={expenseId} />
            ) : null}

            <Field label="Итого">
              <div className="rounded-xl border border-input bg-surface px-3 py-3 text-sm text-foreground">
                {formatCurrency(form.watch("amount") || 0)}
              </div>
            </Field>

            {createMutation.isError || updateMutation.isError || deleteMutation.isError ? (
              <p className="text-sm text-danger">
                {createMutation.error?.message ??
                  updateMutation.error?.message ??
                  deleteMutation.error?.message ??
                  "Не удалось сохранить финансовый расход"}
              </p>
            ) : null}

          </div>

          <div className="mobile-sheet-footer shrink-0 sticky bottom-0 border-t border-border bg-background px-4 py-4 sm:px-5">
            <UnsavedChangesBanner
              visible={isWarningVisible}
              onDismiss={dismissWarning}
              onCloseWithoutSaving={() => {
                dismissWarning();
                onClose();
              }}
            />
            <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <div>
                {!isCreateMode && expenseId && canEditDeleteExpense ? (
                  <AppButton
                    type="button"
                    variant="ghost"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (!window.confirm("Удалить финансовый расход?")) {
                        return;
                      }
                      void deleteMutation.mutateAsync(expenseId).then(() => onClose());
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </AppButton>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <AppButton type="button" variant="outline" onClick={requestClose}>
                  Отменить
                </AppButton>
                {(isCreateMode ? canCreateExpense : canEditDeleteExpense) ? (
                  <AppButton
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending || categoriesQuery.isLoading}
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Сохраняем..." : "Сохранить"}
                  </AppButton>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      ) : null}
    </aside>
  );

  if (isMobile) {
    return <MobileSheet closeOnBackdropClick={false} onClose={requestClose}>{content}</MobileSheet>;
  }

  return <div className="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm lg:block">{content}</div>;
}

function Field({
  children,
  error,
  label
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <div className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
