import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";

import {
  useCreateServiceMutation,
  useServiceCategoriesQuery,
  useServiceDetailQuery,
  useUpdateServiceMutation
} from "@/features/services/api/services-hooks";
import {
  mapFormValuesToServicePayload,
  mapServiceToFormValues,
  serviceFormSchema,
  type ServiceFormValues
} from "@/features/services/model/service-form";
import { cn } from "@/shared/lib/cn";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { formatCurrency } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppCheckbox } from "@/shared/ui/app-checkbox";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect } from "@/shared/ui/app-select";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

type DesktopPanelMode = "docked" | "overlay";

const panelBaseClassName = "z-50 flex flex-col overflow-hidden bg-background shadow-panel";
const centeredDesktopClassName =
  "fixed left-1/2 top-1/2 hidden max-h-[min(880px,calc(100svh-2rem))] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex";

export function ServiceDetailPanel({
  categoryPresetId,
  desktopMode = "overlay",
  isMobile,
  onClose,
  onCreated,
  serviceKey
}: {
  categoryPresetId?: number | null;
  desktopMode?: DesktopPanelMode;
  isMobile: boolean;
  onClose: () => void;
  onCreated: (serviceId: number) => void;
  serviceKey: string | null;
}) {
  useOverlayMode(Boolean(serviceKey), onClose);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const isCreateMode = serviceKey === "new";
  const serviceId = !serviceKey || serviceKey === "new" ? null : Number(serviceKey);

  const serviceQuery = useServiceDetailQuery(serviceId);
  const categoriesQuery = useServiceCategoriesQuery();
  const createMutation = useCreateServiceMutation();
  const updateMutation = useUpdateServiceMutation();

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      category_id: 0,
      default_price: 1,
      is_active: true,
      name: ""
    }
  });

  useEffect(() => {
    if (serviceQuery.data) {
      form.reset(mapServiceToFormValues(serviceQuery.data));
      setSaveMessage(null);
    } else if (isCreateMode) {
      form.reset({
        category_id: categoryPresetId ?? categoriesQuery.data?.[0]?.id ?? 0,
        default_price: 1,
        is_active: true,
        name: ""
      });
      setSaveMessage(null);
    }
  }, [categoriesQuery.data, categoryPresetId, form, isCreateMode, serviceQuery.data]);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = mapFormValuesToServicePayload(values);

    if (isCreateMode) {
      const service = await createMutation.mutateAsync(payload);
      setSaveMessage("Услуга создана");
      onCreated(service.id);
      onClose();
      return;
    }

    if (!serviceId) {
      return;
    }

    await updateMutation.mutateAsync({ payload, serviceId });
    setSaveMessage("Услуга сохранена");
    onClose();
  });

  if (!serviceKey) {
    return null;
  }

  const containerClassName = cn(
    panelBaseClassName,
    isMobile
      ? "fixed inset-0 h-svh w-full"
      : desktopMode === "overlay"
        ? centeredDesktopClassName
        : "hidden h-[calc(100svh-73px)] w-[460px] shrink-0 border-l border-border lg:sticky lg:top-[73px] lg:flex"
  );

  const content = (
    <aside className={containerClassName} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Услуга</p>
          <h2 className="mt-1 text-lg font-semibold">
            {isCreateMode ? "Новая услуга" : serviceQuery.data ? serviceQuery.data.name : `#${serviceId}`}
          </h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть услугу">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!isCreateMode && serviceQuery.isLoading ? (
          <LoadingState title="Загружаем услугу" description="Получаем данные каталога и категорий." />
        ) : null}

        {!isCreateMode && serviceQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить услугу"
            description="Проверьте подключение или выберите другую позицию."
            actionLabel="Повторить"
            onAction={() => void serviceQuery.refetch()}
          />
        ) : null}

        {(isCreateMode || serviceQuery.data) ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="space-y-5">
            {!isCreateMode && serviceQuery.data ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Базовая цена {formatCurrency(serviceQuery.data.default_price)}</div>
                  <StatusBadge label={serviceQuery.data.is_active ? "Активно" : "Неактивно"} tone={serviceQuery.data.is_active ? "success" : "muted"} />
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">Основные поля</h3>
              <div className="mt-4 space-y-4">
                <Field label="Название" error={form.formState.errors.name?.message}>
                  <AppInput {...form.register("name")} />
                </Field>
                <Field label="Категория" error={form.formState.errors.category_id?.message}>
                  <AppSelect {...form.register("category_id", { valueAsNumber: true })} disabled={categoriesQuery.isLoading}>
                    <option value={0}>Выберите категорию</option>
                    {categoriesQuery.data?.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </AppSelect>
                </Field>
                <Field label="Базовая цена, ₽" error={form.formState.errors.default_price?.message}>
                  <AppInput type="number" min={1} step="1" {...form.register("default_price", { valueAsNumber: true })} />
                </Field>
                <AppCheckbox
                  aria-label="Услуга активна"
                  checked={form.watch("is_active")}
                  onChange={(event) => form.setValue("is_active", event.target.checked)}
                />
              </div>
            </section>

            {saveMessage ? (
              <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{saveMessage}</div>
            ) : null}

            {(createMutation.isError || updateMutation.isError) ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                {(createMutation.error ?? updateMutation.error)?.message}
              </div>
            ) : null}

              </div>
            </div>

            <div className="mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5">
              <AppButton className="flex-1" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Сохраняем..." : isCreateMode ? "Создать услугу" : "Сохранить услугу"}
              </AppButton>
              <AppButton
                type="button"
                variant="outline"
                onClick={() =>
                  serviceQuery.data
                    ? form.reset(mapServiceToFormValues(serviceQuery.data))
                    : form.reset({
                        category_id: categoryPresetId ?? categoriesQuery.data?.[0]?.id ?? 0,
                        default_price: 1,
                        is_active: true,
                        name: ""
                      })
                }
              >
                Сбросить
              </AppButton>
            </div>
          </form>
        ) : null}
      </div>
    </aside>
  );

  if (isMobile || desktopMode === "overlay") {
    return <MobileSheet onClose={onClose}>{content}</MobileSheet>;
  }

  return content;
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
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="mt-2 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
