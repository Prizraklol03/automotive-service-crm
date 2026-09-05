import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { FileText, Image as ImageIcon, Paperclip, Trash2, X } from "lucide-react";
import { z } from "zod";

import {
  downloadMaterialAttachment,
  useCreateMaterialMutation,
  useDeleteMaterialMutation,
  useMaterialDetailQuery,
  useMaterialAttachmentsQuery,
  useDeleteMaterialAttachmentMutation,
  useUploadMaterialAttachmentMutation,
  useUpdateMaterialMutation
} from "@/features/materials/api/materials-hooks";
import type { MaterialAttachment } from "@/entities/material/model/types";
import { useServiceCategoriesQuery } from "@/features/services/api/services-hooks";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { cn } from "@/shared/lib/cn";
import { formatCurrency, formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect } from "@/shared/ui/app-select";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { UnsavedChangesBanner } from "@/shared/ui/unsaved-changes-banner";

const formSchema = z.object({
  expense_date: z.string().min(1, "Выберите дату"),
  material_name: z.string().trim().min(1, "Введите наименование"),
  quantity: z.number().int().min(1, "Минимум 1"),
  service_category_id: z.number().int().nullable(),
  unit_price: z.number().min(1, "Цена должна быть больше 0")
});

type FormValues = z.infer<typeof formSchema>;

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MaterialDetailPanel({
  materialKey,
  isMobile,
  onClose
}: {
  materialKey: string | null;
  isMobile: boolean;
  onClose: () => void;
}) {
  const materialId = materialKey && materialKey !== "new" ? Number(materialKey) : null;
  const isCreateMode = materialKey === "new";
  const detailQuery = useMaterialDetailQuery(materialId);
  const attachmentsQuery = useMaterialAttachmentsQuery(materialId);
  const createMutation = useCreateMaterialMutation();
  const updateMutation = useUpdateMaterialMutation();
  const deleteMutation = useDeleteMaterialMutation();
  const uploadAttachmentMutation = useUploadMaterialAttachmentMutation();
  const deleteAttachmentMutation = useDeleteMaterialAttachmentMutation();
  const categoriesQuery = useServiceCategoriesQuery();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      expense_date: todayValue(),
      material_name: "",
      quantity: 1,
      service_category_id: null,
      unit_price: 1
    }
  });

  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(form.formState.isDirty, onClose);

  useOverlayMode(Boolean(materialKey), requestClose);

  useEffect(() => {
    if (isCreateMode) {
      form.reset({
        expense_date: todayValue(),
        material_name: "",
        quantity: 1,
        service_category_id: null,
        unit_price: 1
      });
      return;
    }

    if (detailQuery.data) {
      form.reset({
        expense_date: detailQuery.data.expense_date,
        material_name: detailQuery.data.material_name,
        quantity: detailQuery.data.quantity,
        service_category_id: detailQuery.data.service_category_id,
        unit_price: Number(detailQuery.data.unit_price)
      });
    }
  }, [detailQuery.data, form, isCreateMode]);

  const unitPrice = useWatch({ control: form.control, name: "unit_price" }) ?? 0;
  const quantity = useWatch({ control: form.control, name: "quantity" }) ?? 0;
  const expenseDate = useWatch({ control: form.control, name: "expense_date" }) ?? "";
  const attachments = attachmentsQuery.data ?? [];
  const attachmentsCount = detailQuery.data?.attachments_count ?? attachments.length;

  const openAttachmentPicker = () => {
    attachmentInputRef.current?.click();
  };

  const clearSelectedAttachment = () => {
    setSelectedAttachmentFile(null);
    setAttachmentError(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  const handleAttachmentSelection = (file: File | null) => {
    setSelectedAttachmentFile(file);
    setAttachmentError(null);
  };

  const handleAttachmentUpload = async (file: File | null) => {
    if (!materialId || !file) {
      return;
    }

    setAttachmentError(null);
    try {
      await uploadAttachmentMutation.mutateAsync({ materialId, file });
      clearSelectedAttachment();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Не удалось загрузить вложение");
    }
  };

  const handleAttachmentDownload = async (attachment: MaterialAttachment, viewOnly = false) => {
    if (!materialId) {
      return;
    }

    const result = await downloadMaterialAttachment(materialId, attachment.id);
    const url = URL.createObjectURL(result.blob);

    if (viewOnly) {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename ?? attachment.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  if (!materialKey) return null;

  const content = (
    <aside
      className={cn(
        "z-50 flex flex-col overflow-hidden bg-background shadow-panel",
        isMobile
          ? "fixed inset-0 h-svh w-full"
          : "fixed left-1/2 top-1/2 hidden max-h-[min(780px,calc(100svh-2rem))] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex"
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Материалы</p>
          <h2 className="mt-1 text-lg font-semibold">
            {isCreateMode ? "Добавить материал" : "Редактировать материал"}
          </h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть форму материала">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
        {!isCreateMode && detailQuery.isLoading ? (
          <LoadingState title="Загружаем материал" description="Подготавливаем карточку для редактирования." />
        ) : null}

        {!isCreateMode && detailQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить материал"
            description="Попробуйте открыть запись снова."
            actionLabel="Повторить"
            onAction={() => void detailQuery.refetch()}
          />
        ) : null}

        {isCreateMode || detailQuery.data ? (
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
              const payload = {
                expense_date: values.expense_date,
                material_name: values.material_name.trim(),
                quantity: values.quantity,
                service_category_id: values.service_category_id,
                unit_price: values.unit_price.toFixed(2)
              };

              if (isCreateMode) {
                await createMutation.mutateAsync(payload);
              } else if (materialId) {
                await updateMutation.mutateAsync({ materialId, payload });
              }

              onClose();
            })}
          >
            <Field error={form.formState.errors.material_name?.message} label="Наименование">
              <AppInput {...form.register("material_name")} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
              <Field error={form.formState.errors.unit_price?.message} label="Цена, ₽">
                <AppInput type="number" min={1} step="1" {...form.register("unit_price", { valueAsNumber: true })} />
              </Field>
              <Field error={form.formState.errors.quantity?.message} label="Количество">
                <AppInput type="number" min={1} step="1" {...form.register("quantity", { valueAsNumber: true })} />
              </Field>
            </div>

            <Field label="Сумма">
              <div className="rounded-xl border border-input bg-surface px-3 py-3 text-sm text-foreground">
                {formatCurrency(unitPrice * quantity)}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Категория">
                <AppSelect
                  value={form.watch("service_category_id") ?? ""}
                  onChange={(event) =>
                    form.setValue("service_category_id", event.target.value ? Number(event.target.value) : null, {
                      shouldDirty: true,
                      shouldValidate: true
                    })
                  }
                >
                  <option value="">Без категории</option>
                  {(categoriesQuery.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </AppSelect>
              </Field>

              <Field error={form.formState.errors.expense_date?.message} label="Дата">
                <AppInput
                  className="min-w-0 max-w-full"
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

            {!isCreateMode && materialId ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Вложения</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{attachmentsCount} шт.</p>
                  </div>
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

                <div className="mt-4 space-y-4">
                  <input
                    ref={attachmentInputRef}
                    className="hidden"
                    type="file"
                    onChange={(event) => handleAttachmentSelection(event.target.files?.[0] ?? null)}
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <AppButton
                      type="button"
                      variant="outline"
                      onClick={openAttachmentPicker}
                      disabled={uploadAttachmentMutation.isPending}
                    >
                      <Paperclip className="h-4 w-4" />
                      Прикрепить файл
                    </AppButton>

                    {selectedAttachmentFile ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                        <p className="min-w-0 truncate text-sm text-foreground">{selectedAttachmentFile.name}</p>
                        <AppButton
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={clearSelectedAttachment}
                          disabled={uploadAttachmentMutation.isPending}
                        >
                          Очистить
                        </AppButton>
                      </div>
                    ) : null}

                    <AppButton
                      type="button"
                      disabled={!selectedAttachmentFile || uploadAttachmentMutation.isPending}
                      onClick={() => void handleAttachmentUpload(selectedAttachmentFile)}
                    >
                      {uploadAttachmentMutation.isPending ? "Загружаем..." : "Загрузить"}
                    </AppButton>
                  </div>

                  {attachmentError ? <p className="text-xs text-danger">{attachmentError}</p> : null}
                  {uploadAttachmentMutation.isPending ? <p className="text-xs text-muted-foreground">Загружаем вложение...</p> : null}

                  {attachmentsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Загружаем вложения...</p>
                  ) : attachmentsQuery.isError ? (
                    <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                      <p>Не удалось загрузить вложения.</p>
                      <AppButton
                        className="mt-3"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => void attachmentsQuery.refetch()}
                      >
                        Повторить
                      </AppButton>
                    </div>
                  ) : attachments.length ? (
                    <div className="space-y-2">
                      {attachments.map((attachment) => {
                        const isImage = attachment.mime_type.startsWith("image/");
                        const isPdf = attachment.mime_type === "application/pdf";
                        const isDeleting = pendingDeleteAttachmentId === attachment.id && deleteAttachmentMutation.isPending;
                        return (
                          <div key={attachment.id} className="rounded-xl border border-border/80 bg-background/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {isImage ? (
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <p className="truncate text-sm font-medium text-foreground">{attachment.file_name}</p>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatDateTime(attachment.created_at)} · {formatAttachmentSize(attachment.size)}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <AppButton
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => void handleAttachmentDownload(attachment, true)}
                                  disabled={!isImage && !isPdf}
                                >
                                  Просмотр
                                </AppButton>
                                <AppButton
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => void handleAttachmentDownload(attachment, false)}
                                >
                                  Скачать
                                </AppButton>
                                <AppButton
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  disabled={deleteAttachmentMutation.isPending}
                                  onClick={async () => {
                                    if (!window.confirm("Удалить вложение?")) {
                                      return;
                                    }
                                    setPendingDeleteAttachmentId(attachment.id);
                                    setAttachmentError(null);
                                    try {
                                      await deleteAttachmentMutation.mutateAsync({ attachmentId: attachment.id, materialId });
                                    } catch (error) {
                                      setAttachmentError(error instanceof Error ? error.message : "Не удалось удалить вложение");
                                    } finally {
                                      setPendingDeleteAttachmentId(null);
                                    }
                                  }}
                                >
                                  {isDeleting ? "Удаляем..." : "Удалить"}
                                </AppButton>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                      Пока нет вложений.
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {createMutation.isError || updateMutation.isError || deleteMutation.isError ? (
              <p className="text-sm text-danger">
                {createMutation.error?.message ??
                  updateMutation.error?.message ??
                  deleteMutation.error?.message ??
                  "Не удалось сохранить материал"}
              </p>
            ) : null}

            <div className="space-y-3 border-t border-border pt-4">
              <UnsavedChangesBanner
                visible={isWarningVisible}
                onDismiss={dismissWarning}
                onCloseWithoutSaving={() => {
                  dismissWarning();
                  onClose();
                }}
              />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <div>
                  {!isCreateMode && materialId ? (
                    <AppButton
                      type="button"
                      variant="ghost"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (!window.confirm("Удалить материал?")) return;
                        void deleteMutation.mutateAsync(materialId).then(() => onClose());
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
                  <AppButton type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? "Сохраняем..." : "Сохранить"}
                  </AppButton>
                </div>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </aside>
  );

  if (isMobile) {
    return <MobileSheet closeOnBackdropClick={false} onClose={requestClose}>{content}</MobileSheet>;
  }

  return (
    <div className="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm lg:block">
      {content}
    </div>
  );
}

function Field({
  children,
  error,
  label
}: {
  children: React.ReactNode;
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

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
