import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { PencilLine, UserRound, X } from "lucide-react";

import { getClientDisplayLabel } from "@/entities/client/model/types";
import { useClientDetailQuery, useClientsListQuery } from "@/features/clients/api/clients-hooks";
import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { useCan } from "@/features/auth/model/permissions";
import { useArchiveVehicleMutation, useCarBrandsQuery, useCarModelsByBrandQuery, useCreateVehicleMutation, useVehicleDetailQuery, useUpdateVehicleMutation } from "@/features/vehicles/api/vehicles-hooks";
import {
  createEmptyVehicleFormValues,
  mapFormValuesToVehiclePayload,
  mapVehicleToFormValues,
  type VehicleFormValues,
  vehicleFormSchema
} from "@/features/vehicles/model/vehicle-form";
import { cn } from "@/shared/lib/cn";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { formatPhoneDisplay } from "@/shared/lib/phone";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { SearchableSelect, type SearchableOption } from "@/shared/ui/searchable-select";
import { StatusBadge } from "@/shared/ui/status-badge";
import { UnsavedChangesBanner } from "@/shared/ui/unsaved-changes-banner";

function upperCaseInputValue(value: string) {
  return value.toUpperCase();
}

function toCatalogOptionLabel(value: string) {
  return value.toLocaleUpperCase("ru-RU");
}

type DesktopPanelMode = "docked" | "overlay";

const panelBaseClassName = "z-50 flex min-h-0 flex-col overflow-hidden bg-background shadow-panel";
const sideboardDesktopClassName =
  "fixed inset-y-0 right-0 hidden h-[100svh] w-[min(860px,calc(100vw-2rem))] max-w-full border-l border-border/80 bg-background lg:flex";

export function VehicleDetailPanel({
  clientPresetId,
  desktopMode = "overlay",
  isMobile,
  onClose,
  onCreated,
  onOpenOrder,
  vehicleKey
}: {
  clientPresetId?: number | null;
  desktopMode?: DesktopPanelMode;
  isMobile: boolean;
  onClose: () => void;
  onCreated: (vehicleId: number) => void;
  onOpenOrder?: (orderKey: string) => void;
  vehicleKey: string | null;
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [manualBrandMode, setManualBrandMode] = useState(false);
  const [manualModelMode, setManualModelMode] = useState(false);
  const [nestedClientKey, setNestedClientKey] = useState<string | null>(null);
  const isCreateMode = vehicleKey === "new";
  const vehicleId = !vehicleKey || vehicleKey === "new" ? null : Number(vehicleKey);

  const vehicleQuery = useVehicleDetailQuery(vehicleId);
  const clientsQuery = useClientsListQuery("");
  const presetClientQuery = useClientDetailQuery(clientPresetId ?? null);
  const canViewOrders = useCan("orders.view");
  const canCreateClient = useCan("clients.create");
  const canCreateVehicle = useCan("vehicles.create");
  const canEditVehicle = useCan("vehicles.edit");
  const brandsQuery = useCarBrandsQuery();
  const createVehicleMutation = useCreateVehicleMutation();
  const updateVehicleMutation = useUpdateVehicleMutation();
  const archiveVehicleMutation = useArchiveVehicleMutation();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: createEmptyVehicleFormValues(clientPresetId ?? 0)
  });
  const isHydratingRef = useRef(false);

  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(form.formState.isDirty, onClose);

  useOverlayMode(Boolean(vehicleKey), requestClose);

  const previousBrandIdRef = useRef<number | null | undefined>(undefined);
  const skipNextBrandResetRef = useRef(false);
  const selectedBrandId = useWatch({ control: form.control, name: "brand_id" });
  const selectedClientId = useWatch({ control: form.control, name: "client_id" });
  const selectedModelId = useWatch({ control: form.control, name: "model_id" });
  const plateNumberValue = useWatch({ control: form.control, name: "plate_number" });
  const vinValue = useWatch({ control: form.control, name: "vin" });
  const modelNameValue = useWatch({ control: form.control, name: "model_name" });
  const colorValue = useWatch({ control: form.control, name: "color" });
  const modelsQuery = useCarModelsByBrandQuery(selectedBrandId);

  useEffect(() => {
    if (vehicleQuery.data) {
      isHydratingRef.current = true;
      previousBrandIdRef.current = vehicleQuery.data.brand_id;
      skipNextBrandResetRef.current = true;
      form.reset(mapVehicleToFormValues(vehicleQuery.data));
      setManualBrandMode(Boolean(vehicleQuery.data.brand && !vehicleQuery.data.brand_id));
      setManualModelMode(Boolean(vehicleQuery.data.model && !vehicleQuery.data.model_id));
      setSaveMessage(null);
      queueMicrotask(() => {
        isHydratingRef.current = false;
      });
    } else if (isCreateMode) {
      isHydratingRef.current = true;
      previousBrandIdRef.current = null;
      skipNextBrandResetRef.current = false;
      form.reset(createEmptyVehicleFormValues(clientPresetId ?? 0));
      setManualBrandMode(false);
      setManualModelMode(false);
      setSaveMessage(null);
      queueMicrotask(() => {
        isHydratingRef.current = false;
      });
    }
  }, [clientPresetId, form, isCreateMode, vehicleQuery.data]);

  useEffect(() => {
    if (isHydratingRef.current) {
      return;
    }

    if (skipNextBrandResetRef.current) {
      skipNextBrandResetRef.current = false;
      return;
    }

    if (previousBrandIdRef.current === undefined) {
      previousBrandIdRef.current = selectedBrandId;
      return;
    }

    if (previousBrandIdRef.current !== selectedBrandId) {
      form.setValue("model_id", null);
      form.setValue("model_name", "");
      setManualModelMode(false);
      previousBrandIdRef.current = selectedBrandId;
    }
  }, [form, selectedBrandId]);

  useEffect(() => {
    if (isHydratingRef.current) {
      return;
    }

    const normalized = upperCaseInputValue(plateNumberValue ?? "");
    if (normalized !== (plateNumberValue ?? "")) {
      form.setValue("plate_number", normalized, { shouldDirty: false });
    }
  }, [form, plateNumberValue]);

  useEffect(() => {
    if (isHydratingRef.current) {
      return;
    }

    const normalized = upperCaseInputValue(vinValue ?? "");
    if (normalized !== (vinValue ?? "")) {
      form.setValue("vin", normalized, { shouldDirty: false });
    }
  }, [form, vinValue]);

  useEffect(() => {
    if (isHydratingRef.current) {
      return;
    }

    const normalized = upperCaseInputValue(modelNameValue ?? "");
    if (normalized !== (modelNameValue ?? "")) {
      form.setValue("model_name", normalized, { shouldDirty: false });
    }
  }, [form, modelNameValue]);

  useEffect(() => {
    if (isHydratingRef.current) {
      return;
    }

    const normalized = upperCaseInputValue(colorValue ?? "");
    if (normalized !== (colorValue ?? "")) {
      form.setValue("color", normalized, { shouldDirty: false });
    }
  }, [form, colorValue]);

  const clientOptionFromDetail = useMemo<SearchableOption | null>(() => {
    if (!vehicleQuery.data?.client_id) {
      return null;
    }

    return {
      keywords: [vehicleQuery.data.current_owner_full_name, vehicleQuery.data.current_owner_phone_display ?? ""],
      label: `${vehicleQuery.data.current_owner_full_name} · ${vehicleQuery.data.current_owner_phone_display}`,
      value: String(vehicleQuery.data.client_id)
    };
  }, [vehicleQuery.data]);

  const clientOptionFromPreset = useMemo<SearchableOption | null>(() => {
    const client = presetClientQuery.data;
    if (!client || client.id !== clientPresetId) {
      return null;
    }

    return {
      keywords: [client.full_name, client.phone_display, formatPhoneDisplay(client.phone_display) ?? ""],
      label: `${getClientDisplayLabel(client)} · ${formatPhoneDisplay(client.phone_display) ?? client.phone_display}`,
      value: String(client.id)
    };
  }, [clientPresetId, presetClientQuery.data]);

  const clientOptions = useMemo<SearchableOption[]>(() => {
    const nextOptions: SearchableOption[] = (clientsQuery.data ?? []).map((client) => ({
      keywords: [client.phone_display, formatPhoneDisplay(client.phone_display) ?? ""],
      label: `${client.full_name} · ${formatPhoneDisplay(client.phone_display) ?? client.phone_display}`,
      value: String(client.id)
    }));

    for (const presetOption of [clientOptionFromDetail, clientOptionFromPreset]) {
      if (presetOption && !nextOptions.some((option) => option.value === presetOption.value)) {
        nextOptions.unshift(presetOption);
      }
    }

    return nextOptions;
  }, [clientOptionFromDetail, clientOptionFromPreset, clientsQuery.data]);

  const brandOptions = useMemo(
    () =>
      (brandsQuery.data ?? []).map((brand) => ({
        keywords: [brand.name, ...brand.aliases],
        label: toCatalogOptionLabel(brand.name),
        value: String(brand.id)
      })),
    [brandsQuery.data]
  );

  const modelOptions = useMemo(
    () =>
      (modelsQuery.data ?? []).map((model) => ({
        keywords: [model.name, ...model.aliases],
        label: toCatalogOptionLabel(model.name),
        value: String(model.id)
      })),
    [modelsQuery.data]
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = mapFormValuesToVehiclePayload(values);

    if (isCreateMode) {
      const vehicle = await createVehicleMutation.mutateAsync(payload);
      setSaveMessage("Автомобиль создан");
      form.reset(mapVehicleToFormValues(vehicle));
      setManualBrandMode(Boolean(vehicle.brand && !vehicle.brand_id));
      setManualModelMode(Boolean(vehicle.model && !vehicle.model_id));
      onCreated(vehicle.id);
      onClose();
      return;
    }

    if (!vehicleId) {
      return;
    }

    await updateVehicleMutation.mutateAsync({ payload, vehicleId });
    setSaveMessage("Автомобиль сохранён");
    onClose();
  });

  const handleArchive = async () => {
    if (!vehicleId || isCreateMode || archiveVehicleMutation.isPending) {
      return;
    }

    if (!window.confirm("Архивировать автомобиль? Он исчезнет из активных списков и выбора в новых заявках.")) {
      return;
    }

    await archiveVehicleMutation.mutateAsync(vehicleId);
    onClose();
  };

  if (!vehicleKey) {
    return null;
  }

  const containerClassName = cn(
    panelBaseClassName,
    isMobile ? "fixed inset-0 h-svh w-full" : sideboardDesktopClassName
  );

  const content = (
    <aside className={containerClassName} onClick={(event) => event.stopPropagation()}>
      <div className="sticky top-0 z-[1] flex shrink-0 items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Автомобиль</p>
          <h2 className="mt-1 text-lg font-semibold">
            {isCreateMode ? "Новый автомобиль" : vehicleQuery.data ? vehicleQuery.data.plate_number_display : `#${vehicleId}`}
          </h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть автомобиль">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!isCreateMode && vehicleQuery.isLoading ? (
          <LoadingState title="Загружаем автомобиль" description="Получаем данные автомобиля, клиента и справочников." />
        ) : null}

        {!isCreateMode && vehicleQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить автомобиль"
            description="Проверьте подключение или выберите другой автомобиль."
            actionLabel="Повторить"
            onAction={() => void vehicleQuery.refetch()}
          />
        ) : null}

        {(isCreateMode || vehicleQuery.data) ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 px-5 py-5 sm:px-6">
              <div className="space-y-5">
            {!isCreateMode && vehicleQuery.data ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">Текущий владелец</h3>
                <div className="mt-3">
                  <div className="text-sm font-medium">{vehicleQuery.data.current_owner_full_name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{vehicleQuery.data.current_owner_phone_display}</div>
                </div>
                <div className="mt-4">
                  <AppButton
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => setNestedClientKey(String(vehicleQuery.data!.client_id))}
                  >
                    <UserRound className="h-4 w-4" />
                    Открыть клиента
                  </AppButton>
                </div>
              </section>
            ) : null}

            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">Основная информация</h3>
                <div className="mt-4 space-y-4">
                  <Field label="Клиент" error={form.formState.errors.client_id?.message}>
                    <SearchableSelect
                      actionKeywords={canCreateClient ? ["новый клиент", "добавить клиента", "создать клиента"] : undefined}
                      actionLabel={canCreateClient ? "+ Новый клиент" : undefined}
                      disabled={clientsQuery.isLoading && !clientOptionFromDetail && !clientOptionFromPreset}
                      emptyLabel="Клиенты не найдены"
                      error={clientsQuery.isError}
                      loading={clientsQuery.isLoading && !clientOptionFromDetail && !clientOptionFromPreset}
                      onAction={canCreateClient ? () => setNestedClientKey("new") : undefined}
                      onOpen={() => {
                        if (clientsQuery.isError || (!clientsQuery.isFetching && !clientsQuery.data)) {
                          void clientsQuery.refetch();
                        }
                      }}
                      onRetry={() => void clientsQuery.refetch()}
                      onValueChange={(value) => form.setValue("client_id", value ? Number(value) : 0)}
                      options={clientOptions}
                      placeholder="Выберите клиента"
                      searchPlaceholder="Поиск по имени или телефону"
                      value={selectedClientId ? String(selectedClientId) : null}
                    />
                  </Field>
                  <Field label="Госномер" error={form.formState.errors.plate_number?.message}>
                    <AppInput {...form.register("plate_number")} />
                  </Field>
                  <Field label="VIN">
                    <AppInput {...form.register("vin")} />
                  </Field>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Марка и модель</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Можно выбрать из базы или ввести вручную, если записи ещё нет в справочнике.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <AppButton size="sm" type="button" variant={manualBrandMode ? "default" : "outline"} onClick={() => {
                      setManualBrandMode((current) => !current);
                      form.setValue("brand_id", null);
                      if (manualBrandMode) {
                        form.setValue("brand_name", "");
                      }
                    }}>
                      <PencilLine className="h-4 w-4" />
                      Марка
                    </AppButton>
                    <AppButton size="sm" type="button" variant={manualModelMode ? "default" : "outline"} onClick={() => {
                      setManualModelMode((current) => !current);
                      form.setValue("model_id", null);
                      if (manualModelMode) {
                        form.setValue("model_name", "");
                      }
                    }}>
                      <PencilLine className="h-4 w-4" />
                      Модель
                    </AppButton>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {manualBrandMode ? (
                    <Field label="Марка вручную">
                      <AppInput placeholder="Например, Zeekr" {...form.register("brand_name")} />
                    </Field>
                  ) : (
                    <Field label="Марка">
                      <SearchableSelect
                        disabled={brandsQuery.isLoading}
                        emptyLabel="Марка не найдена"
                        loading={brandsQuery.isLoading}
                        onValueChange={(value) => {
                          form.setValue("brand_id", value ? Number(value) : null);
                          form.setValue("brand_name", "");
                        }}
                        options={brandOptions}
                        placeholder="Выберите марку"
                        searchPlaceholder="Поиск марки"
                        value={selectedBrandId ? String(selectedBrandId) : null}
                      />
                    </Field>
                  )}

                  {manualModelMode ? (
                    <Field label="Модель вручную">
                      <AppInput placeholder="Например, 001" {...form.register("model_name")} />
                    </Field>
                  ) : (
                    <Field label="Модель">
                      <SearchableSelect
                        disabled={!selectedBrandId || modelsQuery.isLoading}
                        emptyLabel={selectedBrandId ? "Модель не найдена" : "Сначала выберите марку"}
                        loading={modelsQuery.isLoading}
                        onValueChange={(value) => {
                          form.setValue("model_id", value ? Number(value) : null);
                          form.setValue("model_name", "");
                        }}
                        options={modelOptions}
                        placeholder={selectedBrandId ? "Выберите модель" : "Сначала выберите марку"}
                        searchPlaceholder="Поиск модели"
                        value={selectedModelId ? String(selectedModelId) : null}
                      />
                    </Field>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">Дополнительно</h3>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Год">
                      <AppInput type="number" {...form.register("year", { setValueAs: (value) => (value ? Number(value) : null) })} />
                    </Field>
                    <Field label="Пробег">
                      <AppInput
                        type="number"
                        min={0}
                        {...form.register("mileage", { setValueAs: (value) => (value ? Number(value) : null) })}
                      />
                    </Field>
                  </div>
                  <Field label="Цвет">
                    <AppInput {...form.register("color")} />
                  </Field>
                  <Field label="Комментарий">
                    <AppTextarea placeholder="Комментарий по автомобилю" {...form.register("comment")} />
                  </Field>
                </div>
              </section>

              {!isCreateMode ? (
                <section className="rounded-2xl border border-border bg-surface p-4">
                  <h3 className="text-sm font-semibold">История владельцев</h3>
                  <div className="mt-4 space-y-3">
                    {vehicleQuery.data?.owner_history.length ? (
                      vehicleQuery.data.owner_history.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-border bg-surface-2 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{entry.title}</div>
                              <div className="mt-1 text-sm text-muted-foreground">{entry.client_full_name}</div>
                            </div>
                            <StatusBadge
                              label={entry.status === "current" ? "Текущий" : "Бывший"}
                              tone={entry.status === "current" ? "success" : "muted"}
                            />
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs text-muted-foreground">Начало владения</div>
                              <div className="mt-1 text-sm font-medium">{formatDate(entry.owned_from)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Окончание владения</div>
                              <div className="mt-1 text-sm font-medium">{entry.owned_to ? formatDate(entry.owned_to) : "Текущее владение"}</div>
                            </div>
                          </div>
                          {entry.comment?.trim() ? <div className="mt-3 text-sm text-muted-foreground">{entry.comment.trim()}</div> : null}
                        </div>
                      ))
                    ) : (
                      <EmptyState title="История владельцев пока пустая" description="Записи появятся после первого сохранения смены владельца." />
                    )}
                  </div>
                </section>
              ) : null}

              {!isCreateMode && canViewOrders ? (
                <section className="rounded-2xl border border-border bg-surface p-4">
                  <h3 className="text-sm font-semibold">История заказов</h3>
                  <div className="mt-4 space-y-3">
                    {vehicleQuery.data?.orders.length ? (
                      vehicleQuery.data.orders.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => onOpenOrder?.(String(order.id))}
                          className="block w-full cursor-pointer rounded-2xl border border-border bg-surface-2 px-4 py-4 text-left transition-colors hover:bg-surface"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">Заказ #{order.id}</div>
                              <div className="mt-1 text-sm text-muted-foreground">{order.client_full_name}</div>
                              {order.comment?.trim() ? <div className="mt-2 text-sm text-muted-foreground">{order.comment.trim()}</div> : null}
                            </div>
                            <StatusBadge label={order.status_display_name || order.status} />
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border bg-surface px-3 py-3">
                              <div className="text-xs text-muted-foreground">К оплате</div>
                              <div className="mt-2 text-sm font-semibold">{order.amount_to_pay}</div>
                            </div>
                            <div className="rounded-2xl border border-border bg-surface px-3 py-3">
                              <div className="text-xs text-muted-foreground">Дата</div>
                              <div className="mt-2 text-sm font-semibold">{formatDateTime(order.completed_at ?? order.scheduled_for ?? null)}</div>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <EmptyState title="Заказов пока нет" description="История заказов появится после первого заказа на этот автомобиль." />
                    )}
                  </div>
                </section>
              ) : null}

              {saveMessage ? (
                <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{saveMessage}</div>
              ) : null}

              {(createVehicleMutation.isError || updateVehicleMutation.isError) ? (
                <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {(createVehicleMutation.error ?? updateVehicleMutation.error)?.message}
                </div>
              ) : null}

              </div>
            </div>
            </div>

              <div className="mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5">
                <div className="space-y-3">
                  <UnsavedChangesBanner
                    visible={isWarningVisible}
                    onDismiss={dismissWarning}
                    onCloseWithoutSaving={() => {
                      dismissWarning();
                      onClose();
                    }}
                  />
                  <div className="flex gap-3">
                    {!isCreateMode && canEditVehicle ? (
                      <AppButton type="button" variant="outline" onClick={() => void handleArchive()} disabled={archiveVehicleMutation.isPending}>
                        {archiveVehicleMutation.isPending ? "Архивируем..." : "Архивировать"}
                      </AppButton>
                    ) : null}
                    {(isCreateMode ? canCreateVehicle : canEditVehicle) ? (
                      <AppButton className="flex-1" type="submit" disabled={createVehicleMutation.isPending || updateVehicleMutation.isPending}>
                        {createVehicleMutation.isPending || updateVehicleMutation.isPending
                          ? "Сохраняем..."
                          : isCreateMode
                            ? "Создать автомобиль"
                            : "Сохранить автомобиль"}
                      </AppButton>
                    ) : null}
                    <AppButton
                      type="button"
                      variant="outline"
                      onClick={() =>
                        vehicleQuery.data
                          ? form.reset(mapVehicleToFormValues(vehicleQuery.data))
                          : form.reset(createEmptyVehicleFormValues(clientPresetId ?? 0))
                      }
                    >
                      Сбросить
                    </AppButton>
                  </div>
                </div>
              </div>
          </form>
        ) : null}
      </div>
    </aside>
  );

  const nestedClientPanel = (
    <ClientDetailPanel
      clientKey={nestedClientKey}
      desktopMode="overlay"
      isMobile={isMobile}
      onClose={() => setNestedClientKey(null)}
      onCreated={(clientId) => {
        form.setValue("client_id", clientId, { shouldDirty: true, shouldValidate: true });
        setSaveMessage("Клиент создан и выбран");
        setNestedClientKey(null);
      }}
      onOpenOrder={onOpenOrder}
      onOpenVehicle={() => undefined}
      onVehicleClose={() => undefined}
      onVehicleCreated={() => undefined}
      vehicleKey={null}
    />
  );

  if (isMobile) {
    return (
      <>
        <MobileSheet onClose={requestClose}>{content}</MobileSheet>
        {nestedClientPanel}
      </>
    );
  }

  return (
    <>
      <div
        className={desktopMode === "overlay" ? "fixed inset-0 z-[240] hidden bg-black/70 backdrop-blur-sm lg:block" : "fixed inset-0 z-[240] hidden bg-black/56 backdrop-blur-[2px] lg:block"}
        onClick={requestClose}
      >
        <div className="h-full w-full">{content}</div>
      </div>
      {nestedClientPanel}
    </>
  );
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
