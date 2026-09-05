import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { CarFront, X } from "lucide-react";

import { useCan } from "@/features/auth/model/permissions";
import { getClientDisplayLabel } from "@/entities/client/model/types";
import { ORDER_STATUS_LABELS } from "@/entities/order/model/types";
import { useArchiveClientMutation, useClientDetailQuery, useClientOrdersQuery, useCreateClientMutation, useUpdateClientMutation } from "@/features/clients/api/clients-hooks";
import { clientFormSchema, mapClientToFormValues, mapFormValuesToClientPayload, type ClientFormValues } from "@/features/clients/model/client-form";
import { useClientVehiclesQuery } from "@/features/vehicles/api/vehicles-hooks";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { cn } from "@/shared/lib/cn";
import { formatCurrency, formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { PhoneInput } from "@/shared/ui/phone-input";
import { StatusBadge } from "@/shared/ui/status-badge";
import { UnsavedChangesBanner } from "@/shared/ui/unsaved-changes-banner";

type DesktopPanelMode = "docked" | "overlay";

const panelBaseClassName = "z-50 flex min-h-0 flex-col overflow-hidden bg-background shadow-panel";
const sideboardDesktopClassName =
  "fixed inset-y-0 right-0 hidden h-[100svh] w-[min(860px,calc(100vw-2rem))] max-w-full border-l border-border/80 bg-background lg:flex";

const emptyClientValues: ClientFormValues = {
  actual_address: "",
  address: "",
  client_type: "individual",
  comment: "",
  company_name: "",
  full_name: "",
  inn: "",
  kpp: "",
  legal_address: "",
  ogrn: "",
  representative_basis: "",
  representative_full_name: "",
  representative_position: "",
  phone: "",
  telegram_username: ""
};

export function ClientDetailPanel({
  clientKey,
  desktopMode = "overlay",
  isMobile,
  onClose,
  onCreated,
  onOpenOrder,
  onOpenVehicle,
  onVehicleClose,
  onVehicleCreated,
  vehicleKey
}: {
  clientKey: string | null;
  desktopMode?: DesktopPanelMode;
  isMobile: boolean;
  onClose: () => void;
  onCreated: (clientId: number) => void;
  onOpenOrder?: (orderKey: string) => void;
  onOpenVehicle: (vehicleKey: string) => void;
  onVehicleClose: () => void;
  onVehicleCreated: (vehicleId: number) => void;
  vehicleKey: string | null;
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [closeAfterVehicleCreate, setCloseAfterVehicleCreate] = useState(false);
  const isCreateMode = clientKey === "new";
  const clientId = !clientKey || clientKey === "new" ? null : Number(clientKey);

  const clientQuery = useClientDetailQuery(clientId);
  const clientOrdersQuery = useClientOrdersQuery(clientId);
  const vehiclesQuery = useClientVehiclesQuery(clientId, !isCreateMode);
  const canViewOrders = useCan("orders.view");
  const canCreateClient = useCan("clients.create");
  const canEditClient = useCan("clients.edit");
  const canCreateVehicle = useCan("vehicles.create");
  const createClientMutation = useCreateClientMutation();
  const updateClientMutation = useUpdateClientMutation();
  const archiveClientMutation = useArchiveClientMutation();

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: emptyClientValues
  });

  const clientType = form.watch("client_type");
  const isLegalClient = clientType === "legal";
  const clientDisplayLabel = isCreateMode ? "Новый клиент" : clientQuery.data ? getClientDisplayLabel(clientQuery.data) : `#${clientId}`;

  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(form.formState.isDirty, onClose);

  useOverlayMode(Boolean(clientKey), requestClose);

  useEffect(() => {
    if (clientKey === null || clientKey === "new") {
      setCloseAfterVehicleCreate(false);
    }
  }, [clientKey]);

  useEffect(() => {
    if (clientQuery.data) {
      form.reset(mapClientToFormValues(clientQuery.data));
      setSaveMessage(null);
      return;
    }

    if (isCreateMode) {
      form.reset(emptyClientValues);
      setSaveMessage(null);
    }
  }, [clientQuery.data, form, isCreateMode]);

  const relatedVehicles = useMemo(() => {
    if (!clientId || !vehiclesQuery.data) {
      return [];
    }

    return vehiclesQuery.data.filter((vehicle) => vehicle.client_id === clientId);
  }, [clientId, vehiclesQuery.data]);

  const relatedVehiclesLoading = !isCreateMode && vehiclesQuery.isLoading && !vehiclesQuery.data;
  const relatedVehiclesError = !isCreateMode && vehiclesQuery.isError && !vehiclesQuery.data;

  const clientOrders = clientOrdersQuery.data?.orders ?? [];

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = mapFormValuesToClientPayload(values);

    if (isCreateMode) {
      const client = await createClientMutation.mutateAsync(payload);
      setCloseAfterVehicleCreate(true);
      onCreated(client.id);
      onClose();
      return;
    }

    if (!clientId) {
      return;
    }

    await updateClientMutation.mutateAsync({ clientId, payload });
    setSaveMessage("Клиент сохранён");
    onClose();
  });

  const handleArchive = async () => {
    if (!clientId || isCreateMode || archiveClientMutation.isPending) {
      return;
    }

    if (!window.confirm("Архивировать клиента? Он исчезнет из активных списков и выбора в новых заявках.")) {
      return;
    }

    await archiveClientMutation.mutateAsync(clientId);
    onClose();
  };

  if (!clientKey) {
    return null;
  }

  const containerClassName = cn(
    panelBaseClassName,
    isMobile ? "fixed inset-0 h-svh w-full" : sideboardDesktopClassName
  );

  const content = (
    <>
      <aside className={containerClassName} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-[1] flex shrink-0 items-start justify-between gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Клиент</p>
              <h2 className="mt-1 text-lg font-semibold">{clientDisplayLabel}</h2>
            </div>
          </div>
          <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть клиента">
            <X className="h-4 w-4" />
          </AppButton>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {!isCreateMode && clientQuery.isLoading ? (
            <LoadingState title="Загружаем клиента" description="Получаем карточку клиента и связанные данные." />
          ) : null}

          {!isCreateMode && clientQuery.isError ? (
            <ErrorState
              title="Не удалось загрузить клиента"
              description="Проверьте подключение или выберите другого клиента."
              actionLabel="Повторить"
              onAction={() => void clientQuery.refetch()}
            />
          ) : null}

          {(isCreateMode || clientQuery.data) ? (
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
              <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 px-5 py-5 sm:px-6">
                <section className="rounded-2xl border border-border bg-surface p-4">
                  <h3 className="text-sm font-semibold">Информация о клиенте</h3>
                  <div className="mt-4 space-y-4">
                    <Field label="Тип клиента">
                      <div className="grid grid-cols-2 gap-2">
                        <AppButton
                          type="button"
                          variant={isLegalClient ? "outline" : "subtle"}
                          className="justify-center"
                          aria-pressed={!isLegalClient}
                          onClick={() =>
                            form.setValue("client_type", "individual", {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true
                            })
                          }
                        >
                          Физическое лицо
                        </AppButton>
                        <AppButton
                          type="button"
                          variant={isLegalClient ? "subtle" : "outline"}
                          className="justify-center"
                          aria-pressed={isLegalClient}
                          onClick={() =>
                            form.setValue("client_type", "legal", {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true
                            })
                          }
                        >
                          Юридическое лицо
                        </AppButton>
                      </div>
                    </Field>

                    {!isLegalClient ? (
                      <>
                        <Field label="ФИО" error={form.formState.errors.full_name?.message}>
                          <AppInput {...form.register("full_name")} />
                        </Field>

                        <Field label="Адрес" error={form.formState.errors.address?.message}>
                          <AppTextarea placeholder="Улица, дом, квартира" {...form.register("address")} />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field label="Название организации" error={form.formState.errors.company_name?.message}>
                          <AppInput {...form.register("company_name")} />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="ИНН" error={form.formState.errors.inn?.message}>
                            <AppInput {...form.register("inn")} />
                          </Field>
                          <Field label="КПП" error={form.formState.errors.kpp?.message}>
                            <AppInput {...form.register("kpp")} />
                          </Field>
                          <Field label="ОГРН" error={form.formState.errors.ogrn?.message}>
                            <AppInput {...form.register("ogrn")} />
                          </Field>
                          <Field label="Юридический адрес" error={form.formState.errors.legal_address?.message}>
                            <AppTextarea {...form.register("legal_address")} />
                          </Field>
                          <Field label="ФИО представителя" error={form.formState.errors.representative_full_name?.message}>
                            <AppInput {...form.register("representative_full_name")} />
                          </Field>
                          <Field label="Должность представителя" error={form.formState.errors.representative_position?.message}>
                            <AppInput {...form.register("representative_position")} />
                          </Field>
                          <Field label="Основание представителя" error={form.formState.errors.representative_basis?.message}>
                            <AppTextarea {...form.register("representative_basis")} />
                          </Field>
                          <Field label="Фактический адрес" error={form.formState.errors.actual_address?.message}>
                            <AppTextarea {...form.register("actual_address")} />
                          </Field>
                        </div>
                      </>
                    )}

                    <Field label="Телефон" error={form.formState.errors.phone?.message}>
                      <Controller
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <PhoneInput
                            placeholder="+7 (999) 888-43-43"
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </Field>

                    <Field label="Telegram">
                      <AppInput placeholder="@username" {...form.register("telegram_username")} />
                    </Field>

                    <Field label="Комментарий">
                      <AppTextarea placeholder="Комментарий по клиенту" {...form.register("comment")} />
                    </Field>
                  </div>
                </section>

                {!isCreateMode ? (
                  <section className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Связанные автомобили</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {canCreateVehicle ? (
                          <AppButton type="button" size="sm" variant="subtle" className="whitespace-nowrap" onClick={() => onOpenVehicle("new")}>
                            <CarFront className="h-4 w-4" />
                            Новый авто
                          </AppButton>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {relatedVehiclesLoading ? (
                        <LoadingState title="Загружаем автомобили клиента" description="Получаем связанные автомобили из CRM." />
                      ) : null}

                      {relatedVehiclesError ? (
                        <ErrorState
                          title="Не удалось загрузить автомобили клиента"
                          description="Проверьте подключение или попробуйте открыть карточку клиента снова."
                          actionLabel="Повторить"
                          onAction={() => void vehiclesQuery.refetch()}
                        />
                      ) : null}

                      {!relatedVehiclesLoading && !relatedVehiclesError ? (
                        relatedVehicles.length ? (
                          relatedVehicles.map((vehicle) => (
                            <button
                              key={vehicle.id}
                              type="button"
                              onClick={() => onOpenVehicle(String(vehicle.id))}
                              className="block w-full cursor-pointer rounded-2xl border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-accent-muted/40"
                            >
                              <div className="font-medium">{vehicle.plate_number_display}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Марка и модель не указаны"}
                              </div>
                            </button>
                          ))
                        ) : (
                          <EmptyState title="У клиента пока нет автомобилей" description="Список появится после привязки хотя бы одного автомобиля." />
                        )
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {!isCreateMode && canViewOrders ? (
                  <section className="rounded-2xl border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold">История заказов</h3>
                    <div className="mt-4 space-y-3">
                      {clientOrders.length ? (
                        clientOrders.map((order) => (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => onOpenOrder?.(String(order.id))}
                            className="block w-full rounded-2xl border border-border bg-surface-2 px-4 py-4 text-left transition-colors hover:bg-surface"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold">Заказ #{order.id}</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                  {order.vehicle_plate_number ??
                                    [order.vehicle_brand, order.vehicle_model].filter(Boolean).join(" ") ??
                                    "Автомобиль не указан"}
                                </div>
                                {order.comment?.trim() ? <div className="mt-2 text-sm text-muted-foreground">{order.comment.trim()}</div> : null}
                              </div>
                              <StatusBadge label={order.status_display_name || ORDER_STATUS_LABELS[order.status] || order.status} />
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <MetricItem label="К оплате" value={formatCurrency(order.amount_to_pay)} />
                              <MetricItem label="Дата" value={formatDateTime(order.completed_at ?? order.scheduled_for ?? null)} />
                            </div>
                          </button>
                        ))
                      ) : (
                        <EmptyState title="Заказов пока нет" description="История заказов появится после первого заказа этого клиента." />
                      )}
                    </div>
                  </section>
                ) : null}

                {saveMessage ? (
                  <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{saveMessage}</div>
                ) : null}

                {(createClientMutation.isError || updateClientMutation.isError) ? (
                  <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                    {(createClientMutation.error ?? updateClientMutation.error)?.message}
                  </div>
                ) : null}
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
                    {!isCreateMode && canEditClient ? (
                      <AppButton type="button" variant="outline" onClick={() => void handleArchive()} disabled={archiveClientMutation.isPending}>
                        {archiveClientMutation.isPending ? "Архивируем..." : "Архивировать"}
                      </AppButton>
                    ) : null}
                    {(isCreateMode ? canCreateClient : canEditClient) ? (
                      <AppButton className="flex-1" type="submit" disabled={createClientMutation.isPending || updateClientMutation.isPending}>
                        {createClientMutation.isPending || updateClientMutation.isPending
                          ? "Сохраняем..."
                          : isCreateMode
                            ? "Создать клиента"
                            : "Сохранить клиента"}
                      </AppButton>
                    ) : null}
                    <AppButton
                      type="button"
                      variant="outline"
                      onClick={() => (clientQuery.data ? form.reset(mapClientToFormValues(clientQuery.data)) : form.reset(emptyClientValues))}
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

      {vehicleKey ? (
        <VehicleDetailPanel
          clientPresetId={clientId}
          desktopMode={desktopMode}
          isMobile={isMobile}
          onClose={() => {
            onVehicleClose();
            if (closeAfterVehicleCreate) {
              setCloseAfterVehicleCreate(false);
            }
          }}
          onCreated={(vehicleId) => {
            onVehicleCreated(vehicleId);
            if (closeAfterVehicleCreate) {
              setCloseAfterVehicleCreate(false);
              window.setTimeout(() => {
                onClose();
              }, 0);
            }
          }}
          onOpenOrder={onOpenOrder}
          vehicleKey={vehicleKey}
        />
      ) : null}
    </>
  );

  if (isMobile) {
    return <MobileSheet onClose={requestClose}>{content}</MobileSheet>;
  }

  return (
    <div
      className={desktopMode === "overlay" ? "fixed inset-0 z-[240] hidden bg-black/70 backdrop-blur-sm lg:block" : "fixed inset-0 z-[240] hidden bg-black/56 backdrop-blur-[2px] lg:block"}
      onClick={requestClose}
    >
      <div className="h-full w-full">{content}</div>
    </div>
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

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value || "—"}</div>
    </div>
  );
}
