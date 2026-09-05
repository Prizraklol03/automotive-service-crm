import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { Trash2, X } from "lucide-react";

import {
  REMINDER_REPEAT_OPTIONS,
  getReminderRepeatLabel,
  getReminderStatusLabel,
  getReminderStatusTone,
  normalizeReminderRepeatRule
} from "@/entities/notification/model/presentation";
import type { ReminderTargetType } from "@/entities/notification/model/types";
import { useClientsListQuery } from "@/features/clients/api/clients-hooks";
import {
  useCreateReminderMutation,
  useDeleteReminderMutation,
  useMarkReminderDoneMutation,
  usePostponeReminderMutation,
  useReminderDetailQuery,
  useRepeatReminderMutation,
  useUpdateReminderMutation
} from "@/features/notifications/api/notifications-hooks";
import {
  postponeReminderSchema,
  reminderEditorSchema,
  repeatReminderSchema,
  type PostponeReminderValues,
  type ReminderEditorValues,
  type RepeatReminderValues
} from "@/features/notifications/model/reminder-form";
import { useOrdersListQuery } from "@/features/orders/api/orders-hooks";
import { useVehiclesListQuery } from "@/features/vehicles/api/vehicles-hooks";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { cn } from "@/shared/lib/cn";
import { toApiLocalDateTime, toLocalDateTimeInputValue } from "@/shared/lib/datetime";
import { formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect } from "@/shared/ui/app-select";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { StatusBadge } from "@/shared/ui/status-badge";
import { UnsavedChangesBanner } from "@/shared/ui/unsaved-changes-banner";

const panelClassName =
  "z-50 flex max-h-[min(900px,calc(100svh-2rem))] w-[min(720px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border/80 bg-background shadow-panel";

function isOpenableTarget(targetType: ReminderTargetType): targetType is "client" | "vehicle" | "order" {
  return targetType === "client" || targetType === "vehicle" || targetType === "order";
}

function getTargetOpenLabel(targetType: ReminderTargetType) {
  if (targetType === "order") return "Открыть заказ";
  if (targetType === "client") return "Открыть клиента";
  if (targetType === "vehicle") return "Открыть автомобиль";
  return "Открыть";
}

export function NotificationDetailPanel({
  isMobile,
  onClose,
  onOpenTarget,
  reminderKey
}: {
  isMobile: boolean;
  onClose: () => void;
  onOpenTarget?: (targetType: "client" | "vehicle" | "order", targetId: number) => void;
  reminderKey: string | null;
}) {
  const isCreateMode = reminderKey === "new";
  const reminderId = !reminderKey || reminderKey === "new" ? null : Number(reminderKey);

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isTargetEditorOpen, setIsTargetEditorOpen] = useState(isCreateMode);

  const reminderQuery = useReminderDetailQuery(reminderId);
  const createMutation = useCreateReminderMutation();
  const updateMutation = useUpdateReminderMutation();
  const deleteMutation = useDeleteReminderMutation();
  const doneMutation = useMarkReminderDoneMutation();
  const postponeMutation = usePostponeReminderMutation();
  const repeatMutation = useRepeatReminderMutation();
  const shouldLoadTargetOptions = isCreateMode || isTargetEditorOpen;
  const clientsQuery = useClientsListQuery("", shouldLoadTargetOptions);
  const vehiclesQuery = useVehiclesListQuery("", shouldLoadTargetOptions);
  const ordersQuery = useOrdersListQuery({ archived: undefined, search: "" }, shouldLoadTargetOptions);

  const editorForm = useForm<ReminderEditorValues>({
    resolver: zodResolver(reminderEditorSchema),
    defaultValues: {
      due_at: "",
      repeat_rule: "",
      target_id: null,
      target_type: "standalone",
      text: ""
    }
  });
  const postponeForm = useForm<PostponeReminderValues>({
    resolver: zodResolver(postponeReminderSchema),
    defaultValues: { postpone_until: "" }
  });
  const repeatForm = useForm<RepeatReminderValues>({
    resolver: zodResolver(repeatReminderSchema),
    defaultValues: { repeat_rule: "" }
  });

  const hasUnsavedChanges = editorForm.formState.isDirty || postponeForm.formState.isDirty || repeatForm.formState.isDirty;
  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(hasUnsavedChanges, onClose);

  useOverlayMode(Boolean(reminderKey), requestClose);

  const watchedTargetType = editorForm.watch("target_type");
  const watchedTargetId = editorForm.watch("target_id");
  const dueAtValue = editorForm.watch("due_at");
  const postponeUntilValue = postponeForm.watch("postpone_until");
  const reminder = reminderQuery.data;

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTargetFallbackOption = useMemo(() => {
    if (!reminder || !watchedTargetId || reminder.target_id !== watchedTargetId || reminder.target_type !== watchedTargetType) {
      return null;
    }

    return {
      keywords: [reminder.target_summary.subtitle ?? ""],
      label: reminder.target_summary.title,
      value: String(watchedTargetId)
    };
  }, [reminder, watchedTargetId, watchedTargetType]);

  const targetOptions = useMemo(() => {
    let nextOptions: { keywords: string[]; label: string; value: string }[] = [];

    if (watchedTargetType === "client") {
      nextOptions = (clientsQuery.data ?? []).map((client) => ({
        keywords: [client.phone_display ?? ""],
        label: client.full_name,
        value: String(client.id)
      }));
    } else if (watchedTargetType === "vehicle") {
      nextOptions = (vehiclesQuery.data ?? []).map((vehicle) => ({
        keywords: [vehicle.brand ?? "", vehicle.model ?? "", vehicle.plate_number_display],
        label: `${vehicle.plate_number_display}${vehicle.brand || vehicle.model ? ` · ${[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}` : ""}`,
        value: String(vehicle.id)
      }));
    } else if (watchedTargetType === "order") {
      nextOptions = (ordersQuery.data ?? []).map((order) => ({
        keywords: [order.client_full_name, order.vehicle_plate_number ?? "", order.vehicle_brand ?? "", order.vehicle_model ?? ""],
        label: `Заказ #${order.id} · ${order.client_full_name}`,
        value: String(order.id)
      }));
    }

    if (currentTargetFallbackOption && !nextOptions.some((option) => option.value === currentTargetFallbackOption.value)) {
      return [currentTargetFallbackOption, ...nextOptions];
    }

    return nextOptions;
  }, [currentTargetFallbackOption, watchedTargetType, clientsQuery.data, vehiclesQuery.data, ordersQuery.data]);

  useEffect(() => {
    if (isCreateMode) {
      setIsTargetEditorOpen(true);
      editorForm.reset({
        due_at: "",
        repeat_rule: "",
        target_id: null,
        target_type: "standalone",
        text: ""
      });
      postponeForm.reset({ postpone_until: "" });
      repeatForm.reset({ repeat_rule: "" });
      setFeedbackMessage(null);
      return;
    }

    if (reminderQuery.data) {
      setIsTargetEditorOpen(false);
      editorForm.reset({
        due_at: toLocalDateTimeInputValue(reminderQuery.data.due_at),
        repeat_rule: normalizeReminderRepeatRule(reminderQuery.data.repeat_rule),
        target_id: reminderQuery.data.target_type === "standalone" ? null : reminderQuery.data.target_id,
        target_type: reminderQuery.data.target_type,
        text: reminderQuery.data.text
      });
      postponeForm.reset({
        postpone_until: toLocalDateTimeInputValue(reminderQuery.data.postpone_until ?? reminderQuery.data.due_at)
      });
      repeatForm.reset({
        repeat_rule: normalizeReminderRepeatRule(reminderQuery.data.repeat_rule)
      });
      setFeedbackMessage(null);
    }
  }, [editorForm, isCreateMode, postponeForm, reminderQuery.data, repeatForm]);

  if (reminderKey === null) return null;

  const statusPresentation = reminder
    ? {
        label: getReminderStatusLabel(reminder.status, reminder),
        tone: getReminderStatusTone(reminder.status, undefined, reminder)
      }
    : null;

  const content = (
    <aside className={cn(panelClassName, isMobile && "h-svh w-full max-h-none rounded-none border-0")}>
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Напоминание</p>
          <h2 className="mt-1 text-lg font-semibold">
            {isCreateMode ? "Новое напоминание" : reminder?.target_summary.title ?? `#${reminderId}`}
          </h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть напоминание">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
        {!isCreateMode && reminderQuery.isLoading ? (
          <LoadingState title="Загружаем напоминание" description="Подготавливаем карточку и доступные действия." />
        ) : null}

        {!isCreateMode && reminderQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить напоминание"
            description="Попробуйте обновить список и открыть карточку снова."
            actionLabel="Повторить"
            onAction={() => void reminderQuery.refetch()}
          />
        ) : null}

        {isCreateMode || reminder ? (
          <div className="space-y-5">
            {!isCreateMode && reminder && statusPresentation ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{reminder.target_summary.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {reminder.target_summary.subtitle ?? "Без привязки"}
                    </div>
                  </div>
                  <StatusBadge label={statusPresentation.label} tone={statusPresentation.tone} />
                </div>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <div>
                    {statusPresentation.label === "Запланировано" ? "Запланировано на" : "Срок"}:{" "}
                    {formatDateTime(reminder.postpone_until ?? reminder.due_at)}
                  </div>
                  <div>Повтор: {getReminderRepeatLabel(reminder.repeat_rule)}</div>
                </div>
                {isOpenableTarget(reminder.target_type) ? (
                  <div className="mt-4">
                    <AppButton
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => onOpenTarget?.(reminder.target_type as "client" | "vehicle" | "order", reminder.target_id)}
                    >
                      {getTargetOpenLabel(reminder.target_type)}
                    </AppButton>
                  </div>
                ) : null}
              </section>
            ) : null}

            <form
              className="rounded-2xl border border-border bg-surface p-4"
              onSubmit={editorForm.handleSubmit(async (values) => {
                const payload = {
                  due_at: toApiLocalDateTime(values.due_at) as string,
                  repeat_rule: values.repeat_rule.trim() ? values.repeat_rule.trim() : null,
                  target_id: values.target_type === "standalone" ? null : values.target_id,
                  target_type: values.target_type,
                  text: values.text.trim()
                };

                if (isCreateMode) {
                  await createMutation.mutateAsync(payload);
                  setFeedbackMessage("Напоминание создано");
                  onClose();
                  return;
                }

                if (!reminderId) return;
                await updateMutation.mutateAsync({ reminderId, payload });
                setFeedbackMessage("Изменения сохранены");
                onClose();
              })}
            >
              <h3 className="text-sm font-semibold">{isCreateMode ? "Создать напоминание" : "Редактирование"}</h3>
              <div className="mt-4 space-y-4">
                <Field error={editorForm.formState.errors.text?.message} label="Текст">
                  <AppTextarea rows={4} {...editorForm.register("text")} />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field error={editorForm.formState.errors.due_at?.message} label="Дата и время">
                    <AppInput
                      name="due_at"
                      onBlur={() => void editorForm.trigger("due_at")}
                      onChange={(event) =>
                        editorForm.setValue("due_at", event.target.value, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true
                        })
                      }
                      type="datetime-local"
                      value={dueAtValue}
                    />
                  </Field>
                  <Field label="Повтор">
                    <AppSelect {...editorForm.register("repeat_rule")}>
                      {REMINDER_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value || "none"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </AppSelect>
                  </Field>
                </div>

                <section className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold">Привязка</h4>
                      {!isCreateMode && reminder ? (
                        <p className="mt-1 text-xs text-muted-foreground">{reminder.target_summary.title}</p>
                      ) : null}
                    </div>
                    {!isCreateMode ? (
                      <AppButton type="button" variant="ghost" size="sm" onClick={() => setIsTargetEditorOpen((current) => !current)}>
                        {isTargetEditorOpen ? "Скрыть" : "Изменить"}
                      </AppButton>
                    ) : null}
                  </div>

                  {(isCreateMode || isTargetEditorOpen) ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field error={editorForm.formState.errors.target_type?.message} label="Привязка">
                        <AppSelect
                          {...editorForm.register("target_type")}
                          onChange={(event) => {
                            editorForm.setValue("target_type", event.target.value as ReminderTargetType, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true
                            });
                            editorForm.setValue("target_id", null, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true
                            });
                          }}
                        >
                          <option value="standalone">Без привязки</option>
                          <option value="order">Заказ</option>
                          <option value="client">Клиент</option>
                          <option value="vehicle">Авто</option>
                        </AppSelect>
                      </Field>

                      {watchedTargetType !== "standalone" ? (
                        <Field
                          error={editorForm.formState.errors.target_id?.message}
                          label={watchedTargetType === "order" ? "Заказ" : watchedTargetType === "client" ? "Клиент" : "Автомобиль"}
                        >
                          <SearchableSelect
                            emptyLabel="Ничего не найдено"
                            error={
                              (watchedTargetType === "client" && clientsQuery.isError) ||
                              (watchedTargetType === "vehicle" && vehiclesQuery.isError) ||
                              (watchedTargetType === "order" && ordersQuery.isError)
                            }
                            loading={clientsQuery.isLoading || vehiclesQuery.isLoading || ordersQuery.isLoading}
                            onOpen={() => {
                              if (watchedTargetType === "client" && (clientsQuery.isError || (!clientsQuery.isFetching && !clientsQuery.data))) {
                                void clientsQuery.refetch();
                              }
                              if (watchedTargetType === "vehicle" && (vehiclesQuery.isError || (!vehiclesQuery.isFetching && !vehiclesQuery.data))) {
                                void vehiclesQuery.refetch();
                              }
                              if (watchedTargetType === "order" && (ordersQuery.isError || (!ordersQuery.isFetching && !ordersQuery.data))) {
                                void ordersQuery.refetch();
                              }
                            }}
                            onRetry={() => {
                              if (watchedTargetType === "client") void clientsQuery.refetch();
                              if (watchedTargetType === "vehicle") void vehiclesQuery.refetch();
                              if (watchedTargetType === "order") void ordersQuery.refetch();
                            }}
                            onValueChange={(value) =>
                              editorForm.setValue("target_id", value ? Number(value) : null, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true
                              })
                            }
                            options={targetOptions}
                            placeholder={watchedTargetType === "order" ? "Выберите заказ" : watchedTargetType === "client" ? "Выберите клиента" : "Выберите автомобиль"}
                            searchPlaceholder="Начните вводить"
                            value={watchedTargetId ? String(watchedTargetId) : null}
                          />
                        </Field>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                      Текущая привязка сохранена. Откройте блок, чтобы изменить получателя напоминания.
                    </div>
                  )}
                </section>

                <div className="flex flex-wrap gap-2">
                  <AppButton type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {isCreateMode ? "Создать" : "Сохранить"}
                  </AppButton>
                  {!isCreateMode && reminder ? (
                    <>
                      <AppButton
                        type="button"
                        variant="outline"
                        disabled={doneMutation.isPending || reminder.status === "done"}
                        onClick={() => void doneMutation.mutateAsync(reminder.id).then(() => setFeedbackMessage("Напоминание завершено"))}
                      >
                        Завершить
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="outline"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (!window.confirm("Удалить напоминание?")) return;
                          void deleteMutation.mutateAsync(reminder.id).then(() => onClose());
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить
                      </AppButton>
                    </>
                  ) : null}
                </div>
              </div>
            </form>

            {!isCreateMode && reminder ? (
              <>
                <form
                  className="rounded-2xl border border-border bg-surface p-4"
                  onSubmit={postponeForm.handleSubmit(async (values) => {
                    await postponeMutation.mutateAsync({
                      postponeUntil: toApiLocalDateTime(values.postpone_until) as string,
                      reminderId: reminder.id
                    });
                    setFeedbackMessage("Напоминание перенесено");
                  })}
                >
                  <h3 className="text-sm font-semibold">Перенести</h3>
                  <div className="mt-4 flex flex-col gap-4">
                    <AppInput
                      name="postpone_until"
                      onBlur={() => void postponeForm.trigger("postpone_until")}
                      onChange={(event) =>
                        postponeForm.setValue("postpone_until", event.target.value, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true
                        })
                      }
                      type="datetime-local"
                      value={postponeUntilValue}
                    />
                    <AppButton type="submit" variant="outline" disabled={postponeMutation.isPending}>
                      Перенести
                    </AppButton>
                  </div>
                </form>

                <form
                  className="rounded-2xl border border-border bg-surface p-4"
                  onSubmit={repeatForm.handleSubmit(async (values) => {
                    await repeatMutation.mutateAsync({
                      reminderId: reminder.id,
                      repeatRule: values.repeat_rule.trim() ? values.repeat_rule.trim() : null
                    });
                    setFeedbackMessage("Правило повтора обновлено");
                  })}
                >
                  <h3 className="text-sm font-semibold">Повтор</h3>
                  <div className="mt-4 flex flex-col gap-4">
                    <AppSelect {...repeatForm.register("repeat_rule")}>
                      {REMINDER_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value || "none"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </AppSelect>
                    <AppButton type="submit" variant="outline" disabled={repeatMutation.isPending}>
                      Сохранить правило
                    </AppButton>
                  </div>
                </form>
              </>
            ) : null}

            <UnsavedChangesBanner
              visible={isWarningVisible}
              onDismiss={dismissWarning}
              onCloseWithoutSaving={() => {
                dismissWarning();
                onClose();
              }}
            />

            {feedbackMessage ? (
              <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{feedbackMessage}</div>
            ) : null}

            {createMutation.isError ||
            updateMutation.isError ||
            deleteMutation.isError ||
            doneMutation.isError ||
            postponeMutation.isError ||
            repeatMutation.isError ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                {(createMutation.error ??
                  updateMutation.error ??
                  deleteMutation.error ??
                  doneMutation.error ??
                  postponeMutation.error ??
                  repeatMutation.error)?.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );

  if (isMobile) {
    return <MobileSheet onClose={requestClose}>{content}</MobileSheet>;
  }

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-40 hidden items-center justify-center bg-black/70 p-4 backdrop-blur-sm lg:flex" onClick={requestClose}>
      <div onClick={(event) => event.stopPropagation()}>{content}</div>
    </div>,
    document.body
  );
}

function Field({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  return (
    <div className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
