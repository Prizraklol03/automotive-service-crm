import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";

import {
  useCreateServiceCategoryMutation,
  useServiceCategoryDetailQuery,
  useUpdateServiceCategoryMutation
} from "@/features/services/api/services-hooks";
import {
  mapCategoryToFormValues,
  mapFormValuesToCategoryPayload,
  serviceCategoryFormSchema,
  type ServiceCategoryFormValues
} from "@/features/services/model/service-form";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";
import { AppCheckbox } from "@/shared/ui/app-checkbox";
import { AppInput } from "@/shared/ui/app-input";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

type DesktopPanelMode = "docked" | "overlay";

const panelBaseClassName = "z-50 flex flex-col overflow-hidden bg-background shadow-panel";
const centeredDesktopClassName =
  "fixed left-1/2 top-1/2 hidden max-h-[min(880px,calc(100svh-2rem))] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex";

const emptyCategoryValues: ServiceCategoryFormValues = {
  color: "#4DA3FF",
  is_active: true,
  name: "",
  sort_order: 0
};

const CATEGORY_COLOR_PRESETS = [
  "#4DA3FF",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#A855F7",
  "#FB00FF",
  "#14B8A6",
  "#F97316",
  "#EAB308",
  "#8B5CF6"
];

export function CategoryDetailPanel({
  categoryKey,
  desktopMode = "overlay",
  isMobile,
  onClose,
  onCreated
}: {
  categoryKey: string | null;
  desktopMode?: DesktopPanelMode;
  isMobile: boolean;
  onClose: () => void;
  onCreated: (categoryId: number) => void;
}) {
  useOverlayMode(Boolean(categoryKey), onClose);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const isCreateMode = categoryKey === "new";
  const categoryId = !categoryKey || categoryKey === "new" ? null : Number(categoryKey);

  const categoryQuery = useServiceCategoryDetailQuery(categoryId);
  const createMutation = useCreateServiceCategoryMutation();
  const updateMutation = useUpdateServiceCategoryMutation();

  const form = useForm<ServiceCategoryFormValues>({
    resolver: zodResolver(serviceCategoryFormSchema),
    defaultValues: emptyCategoryValues
  });
  const categoryColor = form.watch("color");
  const applyCategoryColor = (value: string) =>
    form.setValue("color", value.toUpperCase(), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });

  useEffect(() => {
    if (categoryQuery.data) {
      form.reset(mapCategoryToFormValues(categoryQuery.data));
      setSaveMessage(null);
      return;
    }

    if (isCreateMode) {
      form.reset(emptyCategoryValues);
      setSaveMessage(null);
    }
  }, [categoryQuery.data, form, isCreateMode]);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = mapFormValuesToCategoryPayload(values);

    if (isCreateMode) {
      const category = await createMutation.mutateAsync(payload);
      setSaveMessage("Категория создана");
      onCreated(category.id);
      onClose();
      return;
    }

    if (!categoryId) {
      return;
    }

    await updateMutation.mutateAsync({ categoryId, payload });
    setSaveMessage("Категория сохранена");
    onClose();
  });

  if (!categoryKey) {
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
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Категория</p>
          <h2 className="mt-1 text-lg font-semibold">
            {isCreateMode ? "Новая категория" : categoryQuery.data ? categoryQuery.data.name : `#${categoryId}`}
          </h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть категорию">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!isCreateMode && categoryQuery.isLoading ? (
          <LoadingState title="Загружаем категорию" description="Получаем данные категории услуг." />
        ) : null}

        {!isCreateMode && categoryQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить категорию"
            description="Проверьте подключение и попробуйте снова."
            actionLabel="Повторить"
            onAction={() => void categoryQuery.refetch()}
          />
        ) : null}

        {isCreateMode || categoryQuery.data ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="space-y-5">
            {!isCreateMode && categoryQuery.data ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-white/20"
                      style={{ backgroundColor: categoryQuery.data.color }}
                    />
                    <div className="text-sm font-medium">{categoryQuery.data.name}</div>
                  </div>
                  <StatusBadge
                    label={categoryQuery.data.is_active ? "Активно" : "Неактивно"}
                    tone={categoryQuery.data.is_active ? "success" : "muted"}
                  />
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">Поля категории</h3>
              <div className="mt-4 space-y-4">
                <Field label="Название" error={form.formState.errors.name?.message}>
                  <AppInput {...form.register("name")} />
                </Field>

                <Field label="Цвет категории" error={form.formState.errors.color?.message}>
                  <div className="flex items-center gap-3">
                    <AppInput
                      className="h-12 w-16 cursor-pointer p-1"
                      type="color"
                      value={categoryColor}
                      onChange={(event) => applyCategoryColor(event.target.value)}
                    />
                    <AppInput
                      className="flex-1 uppercase"
                      placeholder="#4DA3FF"
                      value={categoryColor}
                      onChange={(event) => applyCategoryColor(event.target.value)}
                    />
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Быстрый выбор
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_COLOR_PRESETS.map((presetColor) => {
                        const isActive = categoryColor.toUpperCase() === presetColor;

                        return (
                          <button
                            key={presetColor}
                            type="button"
                            onClick={() => applyCategoryColor(presetColor)}
                            className={cn(
                              "h-8 w-8 rounded-full border transition hover:scale-105",
                              isActive
                                ? "border-white shadow-[0_0_0_3px_rgba(255,255,255,0.12)]"
                                : "border-white/10 hover:border-white/30"
                            )}
                            style={{ backgroundColor: presetColor }}
                            aria-label={`Выбрать цвет ${presetColor}`}
                            title={presetColor}
                          />
                        );
                      })}
                    </div>
                  </div>
                </Field>

                <input type="hidden" {...form.register("sort_order", { valueAsNumber: true })} />

                <AppCheckbox
                  aria-label="Категория активна"
                  checked={form.watch("is_active")}
                  onChange={(event) => form.setValue("is_active", event.target.checked)}
                />
              </div>
            </section>

            {saveMessage ? (
              <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
                {saveMessage}
              </div>
            ) : null}

            {createMutation.isError || updateMutation.isError ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                {(createMutation.error ?? updateMutation.error)?.message}
              </div>
            ) : null}

              </div>
            </div>

            <div className="mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5">
              <AppButton className="flex-1" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? "Сохраняем..."
                  : isCreateMode
                    ? "Создать категорию"
                    : "Сохранить категорию"}
              </AppButton>
              <AppButton
                type="button"
                variant="outline"
                onClick={() =>
                  categoryQuery.data ? form.reset(mapCategoryToFormValues(categoryQuery.data)) : form.reset(emptyCategoryValues)
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
