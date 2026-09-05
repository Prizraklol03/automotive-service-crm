import { zodResolver } from "@hookform/resolvers/zod";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  History,
  Loader2,
  Phone,
  Plus,
  X
} from "lucide-react";

import { getReminderStatusLabel, getReminderStatusTone } from "@/entities/notification/model/presentation";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/entities/order/model/types";
import { getClientDisplayLabel, normalizeClientType, type ClientType } from "@/entities/client/model/types";
import { useCan } from "@/features/auth/model/permissions";
import { useClientDetailQuery, useClientsListQuery } from "@/features/clients/api/clients-hooks";
import { ClientDetailPanel } from "@/features/clients/ui/client-detail-panel";
import { OrderDocumentsSection } from "@/features/documents/ui/order-documents-section";
import {
  useCreateOrderReminderMutation,
  useDeleteReminderMutation,
  useMarkReminderDoneMutation,
  useOrderRemindersQuery
} from "@/features/notifications/api/notifications-hooks";
import {
  useCreateOrderMutation,
  useOrderDetailQuery,
  useUpdateOrderMutation,
  useUpdateOrderStatusMutation
} from "@/features/orders/api/orders-hooks";
import {
  createEmptyOrderFormValues,
  mapFormValuesToOrderPayload,
  mapOrderToFormValues,
  orderFormSchema,
  type OrderFormValues
} from "@/features/orders/model/order-form";
import { getVehicleOwnerPresetId } from "@/features/orders/model/vehicle-owner-preset";
import { useServiceCategoriesQuery, useServicesListQuery } from "@/features/services/api/services-hooks";
import { useVehiclesListQuery } from "@/features/vehicles/api/vehicles-hooks";
import { VehicleDetailPanel } from "@/features/vehicles/ui/vehicle-detail-panel";
import {
  useCustomFieldDefsQuery,
  useModulesQuery,
  useOrderFieldValuesQuery,
  useOrderStatusesQuery,
  useUpsertOrderFieldValuesMutation,
} from "@/features/settings/api/settings-hooks";
import type { OrderFieldValue } from "@/entities/settings/model/types";
import { FIELD_TYPE_LABELS } from "@/entities/settings/model/types";
import { InspectionOrderSection } from "@/features/inspection/ui/inspection-order-section";
import { OrderPaymentsSection } from "@/features/orders/ui/order-payments-section";
import { OrderPhotoSection } from "@/features/orders/ui/order-photo-section";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { useScopedBooleanPreference } from "@/shared/hooks/use-scoped-boolean-preference";
import { useUnsavedChangesGuard } from "@/shared/hooks/use-unsaved-changes-guard";
import { cn } from "@/shared/lib/cn";
import { getDefaultDateTimeValue, toApiLocalDateTime } from "@/shared/lib/datetime";
import { formatCurrency, formatDateTime } from "@/shared/lib/format";
import { formatPhoneDisplay, normalizePhoneNumber } from "@/shared/lib/phone";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { AppSelect } from "@/shared/ui/app-select";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { AppSwitch } from "@/shared/ui/app-switch";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { StatusBadge } from "@/shared/ui/status-badge";
import { UnsavedChangesBanner } from "@/shared/ui/unsaved-changes-banner";
import { useVehicleDetailQuery } from "@/features/vehicles/api/vehicles-hooks";

type DesktopPanelMode = "docked" | "overlay";
type OrderDetailVariant = "legacy" | "modern";

const panelBaseClassName = "z-50 flex flex-col overflow-hidden bg-background shadow-panel";
const centeredDesktopClassName =
  "fixed left-1/2 top-1/2 hidden max-h-[min(900px,calc(100svh-2rem))] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex";
const modernDesktopClassName =
  "fixed inset-y-0 right-0 hidden w-[min(860px,calc(100vw-2rem))] max-w-full border-l border-border/80 bg-background lg:flex";
const SOFT_BLOCK_BACKGROUND = "bg-surface-3/70";
const STATUS_PILL_TONE_CLASSES: Record<OrderStatus, { active: string; idle: string }> = {
  cancelled: {
    active: "border-danger/60 bg-danger text-white shadow-[0_12px_30px_rgba(185,28,28,0.22)]",
    idle: "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:bg-surface-3 hover:text-foreground"
  },
  closed: {
    active: "border-success/60 bg-success text-white shadow-[0_12px_30px_rgba(21,128,61,0.22)]",
    idle: "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:bg-surface-3 hover:text-foreground"
  },
  done: {
    active: "border-success/60 bg-success text-white shadow-[0_12px_30px_rgba(21,128,61,0.22)]",
    idle: "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:bg-surface-3 hover:text-foreground"
  },
  new: {
    active: "border-border/80 bg-foreground text-background shadow-sm",
    idle: "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:bg-surface-3 hover:text-foreground"
  },
  in_progress: {
    active: "border-accent/70 bg-accent text-accent-foreground shadow-[0_12px_30px_rgba(86,110,72,0.24)]",
    idle: "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:bg-surface-3 hover:text-foreground"
  }
};

/** Formats "YYYY-MM-DDTHH:MM" -> "14 апр · 12:00" for the header display */
function formatHeaderDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  if (!m) return value;
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const monthName = months[parseInt(m[2]!) - 1] ?? "";
  return `${parseInt(m[3]!)} ${monthName} · ${m[4]}`;
}

function formatVehicleOptionLabel(vehicle: {
  brand: string | null;
  display_name?: string | null;
  model: string | null;
  plate_number_display: string;
}) {
  if (vehicle.display_name?.trim()) {
    return vehicle.display_name;
  }
  return `${vehicle.plate_number_display}${vehicle.brand || vehicle.model ? ` · ${[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}` : ""}`;
}

function getOrderPartyDisplayLabel(party: {
  client_type?: ClientType | null;
  company_name?: string | null;
  display_label?: string;
  full_name?: string | null;
  phone_display: string;
}): string {
  if (party.display_label?.trim()) {
    return party.display_label;
  }

  if (normalizeClientType(party.client_type) === "legal") {
    return party.company_name?.trim() || party.full_name?.trim() || party.phone_display;
  }

  return party.full_name?.trim() || party.phone_display;
}

export function OrderDetailPanel({
  desktopMode = "overlay",
  isMobile,
  onClose,
  onCreated,
  orderKey,
  variant = "legacy"
}: {
  desktopMode?: DesktopPanelMode;
  isMobile: boolean;
  onClose: () => void;
  onCreated?: (orderId: number) => void;
  orderKey: string | null;
  variant?: OrderDetailVariant;
}) {
  const navigate = useNavigate();
  const [nestedClientKey, setNestedClientKey] = useState<string | null>(null);
  const [nestedClientTarget, setNestedClientTarget] = useState<"customer" | "owner" | "payer" | null>(null);
  const [ownerFilterClientId, setOwnerFilterClientId] = useState<number | null>(null);
  const [nestedVehicleKey, setNestedVehicleKey] = useState<string | null>(null);
  const [pendingCreatedVehicleId, setPendingCreatedVehicleId] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reminderText, setReminderText] = useState("");
  const [reminderDueAt, setReminderDueAt] = useState("");
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [expandLastAddedService, setExpandLastAddedService] = useState(false);
  const [servicesHydrated, setServicesHydrated] = useState(false);
  const backdropPointerStartedRef = useRef(false);
  const [isClientEditing, setIsClientEditing] = useState(false);
  const [isPayerEditing, setIsPayerEditing] = useState(false);
  const { value: isDocumentsExpanded, setValue: setIsDocumentsExpanded } = useScopedBooleanPreference(
    "crm.pref.orderDocumentsExpanded",
    true
  );
  const canCreateOrder = useCan("orders.create");
  const canEditOrder = useCan("orders.edit");
  const canCreatePayments = useCan("orders.payments.create");
  const canEditPayments = useCan("orders.payments.edit");
  const canDeletePayments = useCan("orders.payments.delete");
  const canViewClients = useCan("clients.view");
  const canViewVehicles = useCan("vehicles.view");
  const isCreateMode = orderKey === "new";
  const orderId = !orderKey || orderKey === "new" ? null : Number(orderKey);

  const orderQuery = useOrderDetailQuery(orderId);
  const order = orderQuery.data;
  const orderClientSummary = order?.client_summary ?? null;
  const orderVehicleSummary = order?.vehicle_summary ?? null;
  const orderRemindersQuery = useOrderRemindersQuery(orderId);
  const createOrderMutation = useCreateOrderMutation();
  const updateOrderMutation = useUpdateOrderMutation();
  const updateOrderStatusMutation = useUpdateOrderStatusMutation();
  const createOrderReminderMutation = useCreateOrderReminderMutation();
  const deleteReminderMutation = useDeleteReminderMutation();
  const doneReminderMutation = useMarkReminderDoneMutation();
  const servicesCatalogQuery = useServicesListQuery();
  const serviceCategoriesQuery = useServiceCategoriesQuery();
  const orderStatusesQuery = useOrderStatusesQuery();
  const defaultOrderStatus = useMemo(
    () => orderStatusesQuery.data?.find((status) => status.is_default)?.code ?? "new",
    [orderStatusesQuery.data]
  );

  // Dynamic status labels and groups (fallback to hardcoded labels if API hasn't loaded yet)
  const statusLabels = useMemo(() => {
    const map: Record<string, string> = { ...ORDER_STATUS_LABELS };
    orderStatusesQuery.data?.forEach((s) => { map[s.code] = s.display_name; });
    return map;
  }, [orderStatusesQuery.data]);
  const statusGroupMap = useMemo(() => {
    const map: Record<string, string> = {};
    orderStatusesQuery.data?.forEach((s) => { map[s.code] = s.status_group; });
    return map;
  }, [orderStatusesQuery.data]);
  const allStatusButtons = useMemo(
    () => orderStatusesQuery.data?.map((s) => s.code) ?? [],
    [orderStatusesQuery.data]
  );

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: createEmptyOrderFormValues(0, 0, defaultOrderStatus)
  });

  const { dismissWarning, isWarningVisible, requestClose } = useUnsavedChangesGuard(form.formState.isDirty, onClose);

  useOverlayMode(Boolean(orderKey), requestClose);

  const servicesFieldArray = useFieldArray({ control: form.control, name: "services" });

  const selectedClientId = useWatch({ control: form.control, name: "client_id" });
  const selectedPayerClientId = useWatch({ control: form.control, name: "payer_client_id" });
  const dueDate = useWatch({ control: form.control, name: "due_date" }) ?? "";
  const currentStatus = useWatch({ control: form.control, name: "status" }) ?? defaultOrderStatus;
  const scheduledFor = useWatch({ control: form.control, name: "scheduled_for" }) ?? "";
  const handoverAt = useWatch({ control: form.control, name: "handover_at" }) ?? "";
  const selectedVehicleId = useWatch({ control: form.control, name: "vehicle_id" });
  const watchedServices = useWatch({ control: form.control, name: "services" }) ?? [];
  const watchedDiscount = useWatch({ control: form.control, name: "discount_value" }) ?? 0;
  const watchedDiscountType = useWatch({ control: form.control, name: "discount_type" }) ?? "fixed";
  const selectedVehicleDetailQuery = useVehicleDetailQuery(selectedVehicleId || order?.vehicle_id || null);
  const selectedCustomerDetailQuery = useClientDetailQuery(selectedClientId || order?.client_id || null);
  const selectedPayerDetailQuery = useClientDetailQuery(selectedPayerClientId);
  const selectedOwnerDetailQuery = useClientDetailQuery(ownerFilterClientId);

  const selectedVehicleDetail = selectedVehicleDetailQuery.data ?? null;
  const selectedCustomerDetail = selectedCustomerDetailQuery.data ?? null;
  const selectedPayerDetail = selectedPayerDetailQuery.data ?? null;
  const selectedOwnerDetail = selectedOwnerDetailQuery.data ?? null;
  const selectedVehicle = selectedVehicleDetail ?? orderVehicleSummary ?? null;
  const selectedCustomer = selectedCustomerDetail ?? orderClientSummary ?? null;
  const selectedPayer = selectedPayerDetail ?? null;
  const currentVehicleOwnerClientId = selectedVehicle?.client_id ?? null;
  const isCustomerDifferentFromOwner = Boolean(
    isClientEditing || (currentVehicleOwnerClientId !== null && selectedClientId && selectedClientId !== currentVehicleOwnerClientId)
  );
  const isPayerDifferentFromCustomer = Boolean(isPayerEditing || (selectedPayerClientId && selectedPayerClientId !== selectedClientId));

  const modulesQuery = useModulesQuery();
  const photosModuleEnabled = modulesQuery.data?.photos ?? false;
  const customerPayerModuleEnabled = modulesQuery.data?.customer_payer ?? false;
  const inspectionModuleEnabled = true;
  const vehicleClientPresetId = getVehicleOwnerPresetId({
    customerPayerModuleEnabled,
    orderClientId: selectedClientId,
    ownerClientId: ownerFilterClientId
  });

  const shouldLoadClientOptions = true;
  const shouldLoadVehicleOptions = true;
  const clientsQuery = useClientsListQuery("", shouldLoadClientOptions);
  const vehiclesQuery = useVehiclesListQuery("", shouldLoadVehicleOptions);

  useEffect(() => {
    if (order) {
      form.reset(mapOrderToFormValues(order));
      setSaveMessage(null);
      setServicesHydrated(false);
      setIsClientEditing(false);
      setIsPayerEditing(false);
      setOwnerFilterClientId(null);
    } else if (isCreateMode) {
      form.reset(createEmptyOrderFormValues(0, 0, defaultOrderStatus));
      setSaveMessage(null);
      setExpandedServices(new Set());
      setServicesHydrated(true);
      setIsClientEditing(false);
      setIsPayerEditing(false);
      setOwnerFilterClientId(null);
    }
  }, [defaultOrderStatus, form, isCreateMode, order]);

  useEffect(() => {
    if (nestedClientKey === null) {
      setNestedClientTarget(null);
    }
  }, [nestedClientKey]);

  useEffect(() => {
    if (servicesHydrated) {
      return;
    }

    setExpandedServices(new Set());
    setServicesHydrated(true);
  }, [servicesFieldArray.fields, servicesHydrated]);

  useEffect(() => {
    if (!expandLastAddedService) {
      return;
    }

    const lastField = servicesFieldArray.fields[servicesFieldArray.fields.length - 1];
    if (!lastField) {
      return;
    }

    setExpandedServices(new Set([lastField.id]));
    setExpandLastAddedService(false);
  }, [expandLastAddedService, servicesFieldArray.fields]);

  const vehicles = vehiclesQuery.data ?? [];
  const filteredVehicles = useMemo(() => {
    if (customerPayerModuleEnabled) {
      // The owner is chosen independently of the vehicle — once an owner is picked,
      // narrow the vehicle list to that owner's fleet.
      return ownerFilterClientId ? vehicles.filter((vehicle) => vehicle.client_id === ownerFilterClientId) : vehicles;
    }
    return vehicles.filter((vehicle) => !selectedClientId || vehicle.client_id === selectedClientId);
  }, [customerPayerModuleEnabled, ownerFilterClientId, selectedClientId, vehicles]);

  const clientNameById = useMemo(() => {
    const map = new Map<number, string>();
    (clientsQuery.data ?? []).forEach((client) => map.set(client.id, getClientDisplayLabel(client)));
    return map;
  }, [clientsQuery.data]);

  useEffect(() => {
    if (!pendingCreatedVehicleId) {
      return;
    }

    if (filteredVehicles.some((vehicle) => vehicle.id === pendingCreatedVehicleId)) {
      setPendingCreatedVehicleId(null);
    }
  }, [filteredVehicles, pendingCreatedVehicleId]);

  useEffect(() => {
    if (!currentVehicleOwnerClientId || isCustomerDifferentFromOwner) {
      return;
    }

    if (selectedClientId !== currentVehicleOwnerClientId) {
      form.setValue("client_id", currentVehicleOwnerClientId, { shouldDirty: true, shouldValidate: true });
    }
  }, [currentVehicleOwnerClientId, form, isCustomerDifferentFromOwner, selectedClientId]);

  useEffect(() => {
    // Keep the owner filter aligned with whichever vehicle is actually selected,
    // without clobbering a manual owner pick made while no vehicle is chosen yet
    // (selectedVehicleId is falsy in that case, so this no-ops — currentVehicleOwnerClientId
    // alone isn't enough since it falls back to the order's original vehicle summary).
    if (selectedVehicleId && currentVehicleOwnerClientId !== null) {
      setOwnerFilterClientId(currentVehicleOwnerClientId);
    }
  }, [currentVehicleOwnerClientId, selectedVehicleId]);

  const categories = serviceCategoriesQuery.data ?? [];
  const catalogServices = servicesCatalogQuery.data ?? [];
  const selectedClientPhoneHref = selectedCustomer?.phone_display ? normalizePhoneNumber(selectedCustomer.phone_display) : null;
  const selectedClientPhoneLabel =
    (selectedCustomer?.phone_display ? formatPhoneDisplay(selectedCustomer.phone_display) : null) ??
    selectedCustomer?.phone_display ??
    "Телефон не указан";
  const selectedPayerPhoneLabel =
    (selectedPayer?.phone_display ? formatPhoneDisplay(selectedPayer.phone_display) : null) ??
    selectedPayer?.phone_display ??
    selectedClientPhoneLabel;
  const selectedCustomerDisplayLabel = selectedCustomer ? getOrderPartyDisplayLabel(selectedCustomer) : "Клиент не выбран";
  const selectedPayerDisplayLabel = selectedPayer ? getOrderPartyDisplayLabel(selectedPayer) : selectedCustomerDisplayLabel;
  const selectedVehicleOwnerLabel = selectedOwnerDetail ? getOrderPartyDisplayLabel(selectedOwnerDetail) : "Владелец не выбран";
  const selectedVehicleOwnerPhoneLabel =
    (selectedOwnerDetail?.phone_display ? formatPhoneDisplay(selectedOwnerDetail.phone_display) : null) ??
    selectedOwnerDetail?.phone_display ??
    "Телефон не указан";
  const selectedVehicleOwnerPhoneHref = selectedOwnerDetail?.phone_display
    ? normalizePhoneNumber(selectedOwnerDetail.phone_display)
    : null;
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const customFieldDefsQuery = useCustomFieldDefsQuery();
  const orderFieldValuesQuery = useOrderFieldValuesQuery(orderId ?? null);
  const upsertFieldValuesMutation = useUpsertOrderFieldValuesMutation(orderId ?? null);

  // Track local edits to field values (field_key -> value)
	  const [fieldValueEdits, setFieldValueEdits] = useState<Record<string, string | null>>({});
  const [fieldValuesSaving, setFieldValuesSaving] = useState(false);

  const hasCustomFields = (customFieldDefsQuery.data?.length ?? 0) > 0;
  const fieldValues = orderFieldValuesQuery.data ?? [];

  const isModernDesktop = !isMobile && desktopMode === "docked" && variant === "modern";
  const sectionClassName = isModernDesktop
    ? "border-b border-border/70 pb-5 last:border-b-0"
    : "rounded-2xl border border-border bg-surface p-4";
  const nestedCardClassName = isModernDesktop
    ? "rounded-xl bg-surface-3 px-3 py-3"
    : "rounded-2xl border border-border/80 bg-surface-2/60 p-3";
  const insetCardClassName = isModernDesktop
    ? cn("rounded-xl p-4", SOFT_BLOCK_BACKGROUND)
    : "rounded-2xl border border-border bg-surface-2 p-4";

  useEffect(() => {
    watchedServices.forEach((service, index) => {
      if (service.category_id || !service.service_catalog_id) return;
      const catalogService = catalogServices.find((item) => item.id === service.service_catalog_id);
      if (!catalogService) return;
      form.setValue(`services.${index}.category_id`, catalogService.category_id, { shouldDirty: false });
      form.setValue(`services.${index}.category_name_snapshot`, categoryMap.get(catalogService.category_id) ?? "", {
        shouldDirty: false
      });
      if (!service.service_name_snapshot) {
        form.setValue(`services.${index}.service_name_snapshot`, catalogService.name, { shouldDirty: false });
      }
    });
  }, [catalogServices, categoryMap, form, watchedServices]);

  const clientOptions = useMemo(
    () => {
      const nextOptions = (clientsQuery.data ?? []).map((client) => ({
        keywords: [client.company_name ?? "", client.full_name ?? "", client.phone_display, formatPhoneDisplay(client.phone_display) ?? ""],
        label: [getClientDisplayLabel(client), formatPhoneDisplay(client.phone_display) ?? client.phone_display].filter(Boolean).join(" · "),
        value: String(client.id)
      }));

      if (selectedCustomer && !nextOptions.some((option) => option.value === String(selectedCustomer.id))) {
        nextOptions.unshift({
          keywords: [
            selectedCustomer.full_name ?? "",
            selectedCustomer.phone_display,
            formatPhoneDisplay(selectedCustomer.phone_display) ?? ""
          ],
          label: [getOrderPartyDisplayLabel(selectedCustomer), formatPhoneDisplay(selectedCustomer.phone_display) ?? selectedCustomer.phone_display]
            .filter(Boolean)
            .join(" · "),
          value: String(selectedCustomer.id)
        });
      }

      return nextOptions;
    },
    [clientsQuery.data, selectedCustomer]
  );

  const vehicleOptions = useMemo(() => {
    const buildOption = (vehicle: { brand: string | null; client_id: number; id: number; model: string | null; plate_number_display: string }) => {
      const ownerName = customerPayerModuleEnabled ? clientNameById.get(vehicle.client_id) ?? null : null;
      return {
        keywords: [vehicle.brand ?? "", vehicle.model ?? "", vehicle.plate_number_display, ownerName ?? ""],
        label: ownerName ? `${formatVehicleOptionLabel(vehicle)} · ${ownerName}` : formatVehicleOptionLabel(vehicle),
        value: String(vehicle.id)
      };
    };

    const nextOptions = filteredVehicles.map(buildOption);

    if (selectedVehicleId && selectedVehicle && !nextOptions.some((option) => option.value === String(selectedVehicleId))) {
      nextOptions.unshift(buildOption(selectedVehicle));
    }

    return nextOptions;
  }, [clientNameById, customerPayerModuleEnabled, filteredVehicles, selectedVehicle, selectedVehicleId]);

  const categoryOptions = useMemo(() => categories.map((category) => ({ label: category.name, value: String(category.id) })), [categories]);
  const serviceTitles = useMemo(() => watchedServices.map((service) => service.service_name_snapshot?.trim() || "Услуга не выбрана"), [watchedServices]);
  const servicesTotal = watchedServices.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  const discountAmount = watchedDiscountType === "percent"
    ? (servicesTotal * Number(watchedDiscount || 0)) / 100
    : Number(watchedDiscount || 0);
  const totalAfterDiscount = Math.max(servicesTotal - discountAmount, 0);
  const inspectionVehicleLabel = selectedVehicle
    ? [selectedVehicle.brand, selectedVehicle.model, selectedVehicle.plate_number_display].filter(Boolean).join(" · ")
    : "Автомобиль не выбран";

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = mapFormValuesToOrderPayload(values);
    if (isCreateMode) {
      const createdOrder = await createOrderMutation.mutateAsync(payload);
      onCreated?.(createdOrder.id);
      onClose();
      return;
    }
    if (!orderId) return;
    await updateOrderMutation.mutateAsync({ orderId, payload });
    setSaveMessage("Изменения сохранены");
    onClose();
  });

  const handleSaveFieldValues = async () => {
    if (!orderId) return;
    setFieldValuesSaving(true);
    try {
      await upsertFieldValuesMutation.mutateAsync({ values: fieldValueEdits });
      setFieldValueEdits({});
    } finally {
      setFieldValuesSaving(false);
    }
  };

  const handleCreateReminder = async () => {
    if (!orderId) return;
    const normalizedText = reminderText.trim();
    const isoDueAt = toApiLocalDateTime(reminderDueAt);
    if (!normalizedText || !isoDueAt) return;

    await createOrderReminderMutation.mutateAsync({
      orderId,
      payload: {
        due_at: isoDueAt,
        repeat_rule: null,
        text: normalizedText
      }
    });

    setReminderText("");
    setReminderDueAt("");
    setSaveMessage("Напоминание создано");
  };

  const toggleServiceExpanded = (fieldId: string) => {
    setExpandedServices((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  };

  if (!orderKey) return null;

  const handleBackdropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    backdropPointerStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropPointerCancel = () => {
    backdropPointerStartedRef.current = false;
  };

  const handleBackdropClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldClose = backdropPointerStartedRef.current && event.target === event.currentTarget;
    backdropPointerStartedRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };

  const isStatusUpdating = updateOrderStatusMutation.isPending;

  const handleStatusChange = async (status: OrderStatus) => {
    form.setValue("status", status, { shouldDirty: true, shouldValidate: true });

    if (isCreateMode || !orderId || status === order?.status) {
      return;
    }

    try {
      await updateOrderStatusMutation.mutateAsync({ orderId, status });
      setSaveMessage("Статус обновлён");
    } catch {
      form.setValue("status", order?.status ?? status, { shouldDirty: false });
    }
  };

  // в”Ђв”Ђ Status pill helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const STATUS_GROUP_ACTIVE_CLASSES: Record<string, string> = {
    new: "border-border/80 bg-foreground text-background shadow-sm",
    in_progress: "border-accent/70 bg-accent text-accent-foreground shadow-[0_12px_30px_rgba(86,110,72,0.24)]",
    done: "border-success/60 bg-success text-white shadow-[0_12px_30px_rgba(21,128,61,0.22)]",
    closed: "border-success/60 bg-success text-white shadow-[0_12px_30px_rgba(21,128,61,0.22)]",
    cancelled: "border-danger/60 bg-danger text-white shadow-[0_12px_30px_rgba(185,28,28,0.22)]",
  };
  const IDLE_PILL_CLASS = "border-border/70 bg-surface-2 text-muted-foreground hover:border-border hover:bg-surface-3 hover:text-foreground";
  const statusPillClass = (status: string, isActive: boolean) =>
    cn(
      "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200",
      isStatusUpdating && "pointer-events-none opacity-70",
      isActive
        ? (STATUS_GROUP_ACTIVE_CLASSES[statusGroupMap[status] ?? "new"] ?? "border-border/80 bg-foreground text-background shadow-sm")
        : IDLE_PILL_CLASS
    );

  // Dates section for the modern desktop body.
  const datesSection = (
    <section className={sectionClassName}>
      <h3 className="mb-4 text-sm font-semibold">Расписание</h3>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Записан на:
            </div>
          <div className="flex items-center gap-2">
            <AppInput
              name="scheduled_for"
              onBlur={() => void form.trigger("scheduled_for")}
              onFocus={() => { if (!scheduledFor) form.setValue("scheduled_for", getDefaultDateTimeValue(), { shouldDirty: true, shouldTouch: true }); }}
              onChange={(event) =>
                form.setValue("scheduled_for", event.target.value, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true
                })
              }
              type="datetime-local"
              value={scheduledFor}
            />
            {scheduledFor ? (
              <button
                type="button"
                aria-label="Очистить"
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => form.setValue("scheduled_for", "", { shouldDirty: true, shouldValidate: true })}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Выполнить до:
            </div>
            <div className="flex items-center gap-2">
              <AppInput
                name="due_date"
                onBlur={() => void form.trigger("due_date")}
                onFocus={() => { if (!dueDate) form.setValue("due_date", getDefaultDateTimeValue(), { shouldDirty: true, shouldTouch: true }); }}
                onChange={(event) =>
                form.setValue("due_date", event.target.value, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true
                })
              }
              type="datetime-local"
              value={dueDate}
            />
            {dueDate ? (
              <button
                type="button"
                aria-label="Очистить"
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => form.setValue("due_date", "", { shouldDirty: true, shouldValidate: true })}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Выдать авто:
          </div>
          <div className="flex items-center gap-2">
            <AppInput
              name="handover_at"
              onBlur={() => void form.trigger("handover_at")}
              onFocus={() => { if (!handoverAt) form.setValue("handover_at", getDefaultDateTimeValue(), { shouldDirty: true, shouldTouch: true }); }}
              onChange={(event) =>
                form.setValue("handover_at", event.target.value, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true
                })
              }
              type="datetime-local"
              value={handoverAt}
            />
            {handoverAt ? (
              <button
                type="button"
                aria-label="Очистить"
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => form.setValue("handover_at", "", { shouldDirty: true, shouldValidate: true })}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );

  const content = (
    <>
      <aside
        className={cn(
          panelBaseClassName,
          isMobile
            ? "fixed inset-0 h-svh w-full"
            : desktopMode === "overlay"
              ? centeredDesktopClassName
              : modernDesktopClassName
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* в”Ђв”Ђ Header в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
        <div
          className={cn(
            "shrink-0 border-b border-border px-4 py-4 sm:px-5",
            isMobile && "px-4 py-3",
            isModernDesktop && "sticky top-0 z-[1] bg-background/95 backdrop-blur"
          )}
        >
          {isModernDesktop ? (
            /* Rich header for modern desktop Super Order Card */
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold leading-tight">
                    {isCreateMode ? "Новый заказ" : `Заказ #${orderId ?? "..."}`}
                  </h2>
                </div>
                <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть заказ">
                  <X className="h-4 w-4" />
                </AppButton>
              </div>

              {/* Status pills */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {allStatusButtons.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={statusPillClass(status, currentStatus === status)}
                    disabled={isStatusUpdating}
                    onClick={() => void handleStatusChange(status)}
                  >
                    {isStatusUpdating && currentStatus === status ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {statusLabels[status] ?? status}
                  </button>
                ))}
              </div>

              {/* Dates hint */}
              {(scheduledFor || dueDate) ? (
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {scheduledFor ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatHeaderDate(scheduledFor)}
                    </span>
                  ) : null}
                  {dueDate ? (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      до {formatHeaderDate(dueDate)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : isMobile ? (
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <h2 className="flex min-w-0 flex-1 items-baseline text-base font-semibold leading-tight">
                <span className="shrink-0">Заказ №{order?.id ?? orderId ?? "..."} · </span>
                <span className="min-w-0 truncate">{selectedCustomerDisplayLabel}</span>
              </h2>
              <AppButton className="shrink-0" size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть заказ">
                <X className="h-4 w-4" />
              </AppButton>
            </div>
          ) : (
            /* Simple header for desktop overlay */
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Заказ</p>
                <h2 className="mt-1 text-lg font-semibold">{isCreateMode ? "Новый заказ" : order ? `#${order.id}` : `#${orderId}`}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isCreateMode
                    ? "Создание заказа"
                    : selectedCustomerDisplayLabel ?? selectedVehicle?.plate_number_display ?? "Карточка заказа"}
                </p>
              </div>
              <AppButton size="icon" variant="ghost" onClick={requestClose} aria-label="Закрыть заказ">
                <X className="h-4 w-4" />
              </AppButton>
            </div>
          )}
        </div>

        {/* в”Ђв”Ђ Body в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
        <div className={cn("app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5", isModernDesktop && "px-5 py-5 sm:px-6")}>
          {!isCreateMode && orderQuery.isLoading ? (
            <LoadingState title="Загружаем заказ" description="Подготавливаем карточку заказа." />
          ) : null}
          {!isCreateMode && orderQuery.isError ? (
            <ErrorState
              title="Не удалось загрузить заказ"
              description="Проверьте соединение или выберите другой заказ."
              actionLabel="Повторить"
              onAction={() => void orderQuery.refetch()}
            />
          ) : null}

          {isCreateMode || order ? (
            <>
              <form className={cn("space-y-5", isModernDesktop && "space-y-4")} onSubmit={onSubmit}>

                {/* ── 1. Клиент и автомобиль ─────────────────────────────── */}
                <section className={sectionClassName}>
                  <h3 className="text-sm font-semibold">Клиент и автомобиль</h3>
                  <div className="mt-4 space-y-4">
                    <div className={nestedCardClassName}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {customerPayerModuleEnabled ? "Владелец автомобиля" : "Клиент"}
                          </div>
                          {customerPayerModuleEnabled ? (
                            <>
                              <div className="mt-1 text-sm font-medium text-foreground">{selectedVehicleOwnerLabel}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{selectedVehicleOwnerPhoneLabel}</div>
                            </>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          {(customerPayerModuleEnabled ? ownerFilterClientId : selectedClientId) && canViewClients ? (
                            <IconActionButton
                              accent
                              ariaLabel={customerPayerModuleEnabled ? "Перейти к владельцу" : "Перейти к клиенту"}
                              onClick={() => setNestedClientKey(String(customerPayerModuleEnabled ? ownerFilterClientId : selectedClientId))}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </IconActionButton>
                          ) : null}
                          {(customerPayerModuleEnabled ? selectedVehicleOwnerPhoneHref : selectedClientPhoneHref) ? (
                            <AppButton asChild size="sm" variant="outline" className="h-9 rounded-lg px-3">
                              <a href={`tel:${customerPayerModuleEnabled ? selectedVehicleOwnerPhoneHref : selectedClientPhoneHref}`}>
                                <Phone className="h-4 w-4" />
                                Позвонить клиенту
                              </a>
                            </AppButton>
                          ) : (
                            <AppButton size="sm" variant="outline" className="h-9 rounded-lg px-3" disabled>
                              <Phone className="h-4 w-4" />
                              Позвонить клиенту
                            </AppButton>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <Field label={customerPayerModuleEnabled ? "Владелец автомобиля" : "Клиент"} error={form.formState.errors.client_id?.message}>
                          <SearchableSelect
                            actionLabel="+ Новый клиент"
                            disabled={clientsQuery.isLoading && shouldLoadClientOptions}
                            emptyLabel="Клиенты не найдены"
                            error={shouldLoadClientOptions && clientsQuery.isError}
                            loading={clientsQuery.isLoading && shouldLoadClientOptions}
                            onAction={() => {
                              setNestedClientTarget(customerPayerModuleEnabled ? "owner" : "customer");
                              setNestedClientKey("new");
                            }}
                            onOpen={() => {
                              if (shouldLoadClientOptions && (clientsQuery.isError || (!clientsQuery.isFetching && !clientsQuery.data))) {
                                void clientsQuery.refetch();
                              }
                            }}
                            onRetry={() => void clientsQuery.refetch()}
                            onValueChange={(value) => {
                              if (customerPayerModuleEnabled) {
                                const nextOwnerId = value ? Number(value) : null;
                                setOwnerFilterClientId(nextOwnerId);
                                if (nextOwnerId && selectedVehicle && selectedVehicle.client_id !== nextOwnerId) {
                                  form.setValue("vehicle_id", 0, { shouldDirty: true, shouldValidate: true });
                                }
                              } else {
                                form.setValue("client_id", value ? Number(value) : 0, { shouldDirty: true, shouldValidate: true });
                              }
                            }}
                            options={clientOptions}
                            placeholder={customerPayerModuleEnabled ? "Выберите владельца" : "Выберите клиента"}
                            searchPlaceholder="Начните вводить имя или телефон"
                            value={customerPayerModuleEnabled ? (ownerFilterClientId ? String(ownerFilterClientId) : null) : selectedClientId ? String(selectedClientId) : null}
                          />
                        </Field>
                      </div>
                    </div>

                    <div className={nestedCardClassName}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Автомобиль</div>
                        </div>
                        <div className="flex gap-2">
                          {selectedVehicleId && canViewVehicles ? (
                            <IconActionButton accent ariaLabel="Перейти к автомобилю" onClick={() => setNestedVehicleKey(String(selectedVehicleId))}>
                              <ExternalLink className="h-4 w-4" />
                            </IconActionButton>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4">
                        <SearchableSelect
                          actionLabel={selectedClientId || customerPayerModuleEnabled ? "+ Новый автомобиль" : undefined}
                          disabled={!customerPayerModuleEnabled && !selectedClientId}
                          emptyLabel={
                            selectedVehicleId && !selectedVehicle
                              ? "Загружаем автомобиль..."
                              : customerPayerModuleEnabled || selectedClientId
                                ? "Автомобили не найдены"
                                : "Сначала выберите заказчика"
                          }
                          error={shouldLoadVehicleOptions && vehiclesQuery.isError}
                          loading={shouldLoadVehicleOptions && vehiclesQuery.isLoading && !selectedVehicle}
                          onAction={selectedClientId || customerPayerModuleEnabled ? () => setNestedVehicleKey("new") : undefined}
                          onOpen={() => {
                            if (shouldLoadVehicleOptions && (vehiclesQuery.isError || (!vehiclesQuery.isFetching && !vehiclesQuery.data))) {
                              void vehiclesQuery.refetch();
                            }
                          }}
                          onRetry={() => void vehiclesQuery.refetch()}
                          onValueChange={(value) => {
                            form.setValue("vehicle_id", value ? Number(value) : 0, { shouldDirty: true, shouldValidate: true });
                          }}
                          options={vehicleOptions}
                          placeholder={
                            selectedVehicleId && !selectedVehicle
                              ? "Загружаем автомобиль..."
                              : customerPayerModuleEnabled
                                ? "Выберите автомобиль или владельца"
                                : selectedClientId
                                  ? "Выберите автомобиль"
                                  : "Сначала выберите заказчика"
                          }
                          searchPlaceholder={customerPayerModuleEnabled ? "Номер, марка, модель или владелец" : "Начните вводить номер, марку или модель"}
                          value={selectedVehicleId ? String(selectedVehicleId) : null}
                        />
                        {form.formState.errors.vehicle_id?.message ? (
                          <p className="mt-2 text-xs text-danger">{form.formState.errors.vehicle_id.message}</p>
                        ) : null}
                      </div>
                    </div>

                    {customerPayerModuleEnabled ? (
                      <>
                        <div className={nestedCardClassName}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Заказчик</div>
                            <label className="flex items-center gap-3 text-sm text-foreground">
                              <span>Заказчик отличается от владельца автомобиля</span>
                              <AppSwitch
                                checked={isCustomerDifferentFromOwner}
                                onChange={(checked) => {
                                  setIsClientEditing(checked);
                                  if (!checked && currentVehicleOwnerClientId) {
                                    form.setValue("client_id", currentVehicleOwnerClientId, { shouldDirty: true, shouldValidate: true });
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">По умолчанию заказчик совпадает с владельцем автомобиля.</div>

                          {isCustomerDifferentFromOwner || isClientEditing || !selectedCustomer ? (
                            <div className="mt-4">
                              <Field label="Клиент-заказчик" error={form.formState.errors.client_id?.message}>
                                <SearchableSelect
                                  actionLabel="+ Новый клиент"
                                  disabled={clientsQuery.isLoading && shouldLoadClientOptions}
                                  emptyLabel="Клиенты не найдены"
                                  error={shouldLoadClientOptions && clientsQuery.isError}
                                  loading={clientsQuery.isLoading && shouldLoadClientOptions}
                                  onAction={() => {
                                    setNestedClientTarget("customer");
                                    setNestedClientKey("new");
                                  }}
                                  onOpen={() => {
                                    if (shouldLoadClientOptions && (clientsQuery.isError || (!clientsQuery.isFetching && !clientsQuery.data))) {
                                      void clientsQuery.refetch();
                                    }
                                  }}
                                  onRetry={() => void clientsQuery.refetch()}
                                  onValueChange={(value) => {
                                    form.setValue("client_id", value ? Number(value) : 0, { shouldDirty: true, shouldValidate: true });
                                    setIsClientEditing(Boolean(value));
                                  }}
                                  options={clientOptions}
                                  placeholder="Выберите заказчика"
                                  searchPlaceholder="Начните вводить имя или телефон"
                                  value={selectedClientId ? String(selectedClientId) : null}
                                />
                              </Field>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5",
                                isModernDesktop ? SOFT_BLOCK_BACKGROUND : "border border-border/70 bg-background/40"
                              )}
                            >
                              <div className="min-w-0 select-text">
                                <div className="truncate text-sm font-medium text-foreground">{selectedCustomerDisplayLabel}</div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">{selectedClientPhoneLabel}</div>
                                <div className="mt-1 text-xs text-muted-foreground">Совпадает с владельцем автомобиля</div>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {selectedClientPhoneHref ? (
                                  <AppButton asChild size="sm" variant="outline" className="h-9 rounded-lg px-3">
                                    <a href={`tel:${selectedClientPhoneHref}`}>
                                      <Phone className="h-4 w-4" />
                                      Позвонить клиенту
                                    </a>
                                  </AppButton>
                                ) : (
                                  <AppButton size="sm" variant="outline" className="h-9 rounded-lg px-3" disabled>
                                    <Phone className="h-4 w-4" />
                                    Позвонить клиенту
                                  </AppButton>
                                )}
                                {canViewClients ? (
                                  <IconActionButton accent ariaLabel="Перейти к клиенту" onClick={() => setNestedClientKey(String(selectedClientId))}>
                                    <ExternalLink className="h-4 w-4" />
                                  </IconActionButton>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className={nestedCardClassName}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Плательщик</div>
                            <label className="flex items-center gap-3 text-sm text-foreground">
                              <span>Плательщик отличается от заказчика</span>
                              <AppSwitch
                                checked={isPayerDifferentFromCustomer}
                                onChange={(checked) => {
                                  setIsPayerEditing(checked);
                                  if (!checked) {
                                    form.setValue("payer_client_id", null, { shouldDirty: true, shouldValidate: true });
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">Если плательщик не задан, оплата идёт от заказчика.</div>

                          {isPayerDifferentFromCustomer || isPayerEditing ? (
                            <div className="mt-4">
                              <Field label="Клиент-плательщик" error={form.formState.errors.payer_client_id?.message}>
                                <SearchableSelect
                                  actionLabel="+ Новый клиент"
                                  disabled={clientsQuery.isLoading && shouldLoadClientOptions}
                                  emptyLabel="Клиенты не найдены"
                                  error={shouldLoadClientOptions && clientsQuery.isError}
                                  loading={clientsQuery.isLoading && shouldLoadClientOptions}
                                  onAction={() => {
                                    setNestedClientTarget("payer");
                                    setNestedClientKey("new");
                                  }}
                                  onOpen={() => {
                                    if (shouldLoadClientOptions && (clientsQuery.isError || (!clientsQuery.isFetching && !clientsQuery.data))) {
                                      void clientsQuery.refetch();
                                    }
                                  }}
                                  onRetry={() => void clientsQuery.refetch()}
                                  onValueChange={(value) => {
                                    const nextValue = value ? Number(value) : 0;
                                    form.setValue("payer_client_id", nextValue && nextValue !== selectedClientId ? nextValue : null, {
                                      shouldDirty: true,
                                      shouldValidate: true
                                    });
                                    setIsPayerEditing(Boolean(nextValue && nextValue !== selectedClientId));
                                  }}
                                  options={clientOptions}
                                  placeholder="Выберите плательщика"
                                  searchPlaceholder="Начните вводить имя или телефон"
                                  value={selectedPayerClientId ? String(selectedPayerClientId) : null}
                                />
                              </Field>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5",
                                isModernDesktop ? SOFT_BLOCK_BACKGROUND : "border border-border/70 bg-background/40"
                              )}
                            >
                              <div className="min-w-0 select-text">
                                <div className="truncate text-sm font-medium text-foreground">{selectedPayerDisplayLabel}</div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">{selectedPayerPhoneLabel}</div>
                                <div className="mt-1 text-xs text-muted-foreground">Совпадает с заказчиком</div>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {selectedClientPhoneHref ? (
                                  <AppButton asChild size="sm" variant="outline" className="h-9 rounded-lg px-3">
                                    <a href={`tel:${selectedClientPhoneHref}`}>
                                      <Phone className="h-4 w-4" />
                                      Позвонить клиенту
                                    </a>
                                  </AppButton>
                                ) : (
                                  <AppButton size="sm" variant="outline" className="h-9 rounded-lg px-3" disabled>
                                    <Phone className="h-4 w-4" />
                                    Позвонить клиенту
                                  </AppButton>
                                )}
                                {(selectedPayerClientId ?? selectedClientId) && canViewClients ? (
                                  <IconActionButton
                                    accent
                                    ariaLabel="Перейти к плательщику"
                                    onClick={() => setNestedClientKey(String(selectedPayerClientId ?? selectedClientId))}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </IconActionButton>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>

                {/* ── 2. Статус / Расписание ─────────────────────────────── */}
                {isModernDesktop ? (
                  /* Modern desktop: compact dates section (status is in header) */
                  datesSection
                ) : (
                  /* Overlay / mobile: full status section with buttons + dates + history */
                  <section className={sectionClassName}>
                    <h3 className="text-sm font-semibold">Статус</h3>
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {allStatusButtons.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={statusPillClass(status, currentStatus === status)}
                            disabled={isStatusUpdating}
                            onClick={() => void handleStatusChange(status)}
                          >
                            {isStatusUpdating && currentStatus === status ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {statusLabels[status] ?? status}
                          </button>
                        ))}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">Записан на:</div>
                          <div className="flex items-center gap-2">
                            <AppInput
                              name="scheduled_for"
                              onBlur={() => void form.trigger("scheduled_for")}
                              onFocus={() => { if (!scheduledFor) form.setValue("scheduled_for", getDefaultDateTimeValue(), { shouldDirty: true, shouldTouch: true }); }}
                              onChange={(e) => form.setValue("scheduled_for", e.target.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                              type="datetime-local"
                              value={scheduledFor}
                            />
                            {scheduledFor ? (
                              <button type="button" aria-label="Очистить дату" className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => form.setValue("scheduled_for", "", { shouldDirty: true, shouldValidate: true })}>
                                <X className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Выполнить до:</div>
                  <div className="flex items-center gap-2">
                    <AppInput
                      name="due_date"
                      onBlur={() => void form.trigger("due_date")}
                      onFocus={() => { if (!dueDate) form.setValue("due_date", getDefaultDateTimeValue(), { shouldDirty: true, shouldTouch: true }); }}
                      onChange={(e) => form.setValue("due_date", e.target.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                      type="datetime-local"
                      value={dueDate}
                    />
                    {dueDate ? (
                      <button type="button" aria-label="Очистить дату" className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => form.setValue("due_date", "", { shouldDirty: true, shouldValidate: true })}>
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Выдать авто:</div>
                  <div className="flex items-center gap-2">
                    <AppInput
                      name="handover_at"
                      onBlur={() => void form.trigger("handover_at")}
                      onFocus={() => { if (!handoverAt) form.setValue("handover_at", getDefaultDateTimeValue(), { shouldDirty: true, shouldTouch: true }); }}
                      onChange={(e) => form.setValue("handover_at", e.target.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                      type="datetime-local"
                      value={handoverAt}
                    />
                    {handoverAt ? (
                      <button type="button" aria-label="Очистить дату" className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => form.setValue("handover_at", "", { shouldDirty: true, shouldValidate: true })}>
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                      </div>

                    </div>
                  </section>
                )}

                {/* ── 3. Услуги ──────────────────────────────────────────── */}
                <section className={sectionClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Услуги</h3>
                    {watchedServices.length > 0 && (
                      <span className="text-xs text-muted-foreground">{watchedServices.length} позиций</span>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    {servicesFieldArray.fields.length ? (
                      servicesFieldArray.fields.map((field, index) => {
                        const selectedCategoryId = watchedServices[index]?.category_id ?? null;
                        const availableServices = catalogServices.filter((service) => service.category_id === selectedCategoryId);
                        const selectedServiceId = watchedServices[index]?.service_catalog_id ?? null;
                        const isExpanded = expandedServices.has(field.id);
                        const serviceTotal = Number(watchedServices[index]?.unit_price || 0) * Number(watchedServices[index]?.quantity || 0);

                        return (
                          <div key={field.id} className={cn("p-3", insetCardClassName)}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 text-left"
                              onClick={() => toggleServiceExpanded(field.id)}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{serviceTitles[index] ?? "Услуга не выбрана"}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{formatCurrency(serviceTotal)}</div>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                            </button>

                            {isExpanded ? (
                              <div className="mt-3 grid gap-3 border-t border-border/70 pt-3">
                                <Field label="Категория">
                                  <SearchableSelect
                                    emptyLabel="Категория не найдена"
                                    error={serviceCategoriesQuery.isError}
                                    loading={serviceCategoriesQuery.isLoading}
                                    onOpen={() => {
                                      if (serviceCategoriesQuery.isError || (!serviceCategoriesQuery.isFetching && !serviceCategoriesQuery.data)) {
                                        void serviceCategoriesQuery.refetch();
                                      }
                                    }}
                                    onRetry={() => void serviceCategoriesQuery.refetch()}
                                    onValueChange={(value) => {
                                      const nextCategoryId = value ? Number(value) : null;
                                      form.setValue(`services.${index}.category_id`, nextCategoryId, { shouldDirty: true });
                                      form.setValue(`services.${index}.category_name_snapshot`, nextCategoryId ? categoryMap.get(nextCategoryId) ?? "" : "", { shouldDirty: true });
                                      form.setValue(`services.${index}.service_catalog_id`, null, { shouldDirty: true });
                                      form.setValue(`services.${index}.service_name_snapshot`, "", { shouldDirty: true });
                                      form.setValue(`services.${index}.unit_price`, 0, { shouldDirty: true });
                                    }}
                                    options={categoryOptions}
                                    placeholder="Выберите категорию"
                                    searchPlaceholder="Начните вводить категорию"
                                    value={selectedCategoryId ? String(selectedCategoryId) : null}
                                  />
                                </Field>

                                <Field label="Услуга" error={form.formState.errors.services?.[index]?.service_name_snapshot?.message}>
                                  <SearchableSelect
                                    disabled={!selectedCategoryId}
                                    emptyLabel={selectedCategoryId ? "Услуга не найдена" : "Сначала выберите категорию"}
                                    error={servicesCatalogQuery.isError}
                                    loading={servicesCatalogQuery.isLoading}
                                    onOpen={() => {
                                      if (servicesCatalogQuery.isError || (!servicesCatalogQuery.isFetching && !servicesCatalogQuery.data)) {
                                        void servicesCatalogQuery.refetch();
                                      }
                                    }}
                                    onRetry={() => void servicesCatalogQuery.refetch()}
                                    onValueChange={(value) => {
                                      const nextServiceId = value ? Number(value) : null;
                                      form.setValue(`services.${index}.service_catalog_id`, nextServiceId, { shouldDirty: true });
                                      if (nextServiceId === null) {
                                        form.setValue(`services.${index}.service_name_snapshot`, "", { shouldDirty: true });
                                        form.setValue(`services.${index}.unit_price`, 0, { shouldDirty: true });
                                        return;
                                      }
                                      const selectedService = availableServices.find((service) => service.id === nextServiceId);
                                      if (!selectedService) return;
                                      form.setValue(`services.${index}.service_name_snapshot`, selectedService.name, { shouldDirty: true });
                                      form.setValue(`services.${index}.category_name_snapshot`, categoryMap.get(selectedService.category_id) ?? "", { shouldDirty: true });
                                      form.setValue(`services.${index}.unit_price`, Number(selectedService.default_price), { shouldDirty: true });
                                    }}
                                    options={availableServices.map((service) => ({
                                      keywords: [categoryMap.get(service.category_id) ?? ""],
                                      label: service.name,
                                      value: String(service.id)
                                    }))}
                                    placeholder={selectedCategoryId ? "Выберите услугу" : "Сначала выберите категорию"}
                                    searchPlaceholder="Начните вводить услугу"
                                    value={selectedServiceId ? String(selectedServiceId) : null}
                                  />
                                </Field>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Field label="Цена, ₽" error={form.formState.errors.services?.[index]?.unit_price?.message}>
                                    <AppInput type="number" min={0} step="1" {...form.register(`services.${index}.unit_price`, { valueAsNumber: true })} />
                                  </Field>
                                  <Field label="Количество" error={form.formState.errors.services?.[index]?.quantity?.message}>
                                    <AppInput type="number" min={1} step="1" {...form.register(`services.${index}.quantity`, { valueAsNumber: true })} />
                                  </Field>
                                </div>

                                <div className="flex justify-end">
                                  <AppButton type="button" size="sm" variant="ghost" onClick={() => servicesFieldArray.remove(index)}>
                                    Удалить
                                  </AppButton>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className={cn("px-4 py-6 text-sm text-muted-foreground", isModernDesktop ? "rounded-xl bg-surface-2/50" : "rounded-2xl border border-dashed border-border")}>
                        Добавьте хотя бы одну услугу в заказ.
                      </div>
                    )}

                    <div className="flex justify-start">
                      <AppButton
                        type="button"
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setExpandLastAddedService(true);
                          servicesFieldArray.append({
                            category_id: null,
                            category_name_snapshot: "",
                            quantity: 1,
                            service_catalog_id: null,
                            service_name_snapshot: "",
                            sort_key: servicesFieldArray.fields.length,
                            unit_price: 0
                          });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Добавить услугу
                      </AppButton>
                    </div>
                  </div>
                </section>

                {/* 4.5. Оплаты */}
                {!isCreateMode && orderId && order ? (
                  <OrderPaymentsSection
                    isModernDesktop={isModernDesktop}
                    canCreatePayments={canCreatePayments}
                    canEditPayments={canEditPayments}
                    canDeletePayments={canDeletePayments}
                    order={order}
                    orderId={orderId}
                    sectionClassName={sectionClassName}
                  />
                ) : null}

                {/* ── 4. Фотографии ──────────────────────────────────────── */}
                {!isCreateMode && orderId && photosModuleEnabled ? (
                  <OrderPhotoSection
                    orderId={orderId}
                    sectionClassName={sectionClassName}
                    isModernDesktop={isModernDesktop}
                    useDesktopStagePicker={!isMobile}
                  />
                ) : null}

                {!isCreateMode && orderId && inspectionModuleEnabled ? (
                  <InspectionOrderSection
                    isMobile={isMobile}
                    isModernDesktop={isModernDesktop}
                    orderId={orderId}
                        orderLabel={`Заказ #${orderId}`}
                    sectionClassName={sectionClassName}
                    vehicleLabel={inspectionVehicleLabel}
                  />
                ) : null}

                {/* ── 5. Документы ───────────────────────────────────────── */}
                {!isCreateMode && orderId ? (
                  <section className={sectionClassName}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Документы</h3>
                      <div className="flex items-center gap-2">
                        <AppButton size="sm" type="button" variant="outline" onClick={() => navigate(`/documents?order=${orderId}`)}>
                          <ExternalLink className="h-4 w-4" />
                          Реестр
                        </AppButton>
                        <AppButton
                          aria-expanded={isDocumentsExpanded}
                          aria-label={isDocumentsExpanded ? "Свернуть документы" : "Развернуть документы"}
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setIsDocumentsExpanded(!isDocumentsExpanded)}
                        >
                          {isDocumentsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </AppButton>
                      </div>
                    </div>

                    {isDocumentsExpanded ? (
                      <div className="mt-4">
                        <OrderDocumentsSection mode="compact" orderId={orderId} />
                      </div>
                    ) : null}
                  </section>
                ) : isCreateMode ? (
                  <section className={sectionClassName}>
                    <h3 className="text-sm font-semibold">Документы</h3>
                    <div className={cn("mt-4 px-4 py-6 text-sm text-muted-foreground", isModernDesktop ? "rounded-xl bg-surface-2/50" : "rounded-2xl border border-dashed border-border")}>
                      Сначала сохраните заказ, чтобы создать документы.
                    </div>
                  </section>
                ) : null}

                {/* ── 6. Оплата ──────────────────────────────────────────── */}
                {/* ── 7. Комментарий ─────────────────────────────────────── */}
                <section className={sectionClassName}>
                  <h3 className="text-sm font-semibold">Комментарий</h3>
                  <div className="mt-4">
                    <Field label="">
                      <AppTextarea rows={4} placeholder="Дополнительная информация по заказу..." {...form.register("comment")} />
                    </Field>
                  </div>
                </section>

                {/* ── 7.5 Дополнительные поля ───────────────────────────── */}
                {hasCustomFields && !isCreateMode && (
                  <section className={sectionClassName}>
                    <h3 className="text-sm font-semibold">Дополнительные поля</h3>
                    <div className="mt-4 space-y-3">
                      {orderFieldValuesQuery.isLoading ? (
                        <div className="text-sm text-muted-foreground">Загрузка...</div>
                      ) : (
                        <>
	                          {fieldValues.map((fv) => {
	                            const editedValue =
	                              fv.field_key in fieldValueEdits
	                                ? fieldValueEdits[fv.field_key]
	                                : (fv.value ?? "");
	                            return (
	                              <div key={fv.field_key} className="space-y-1">
	                                <label className="text-xs font-medium text-muted-foreground">
	                                  {fv.label}
                                      {fv.is_required ? <span className="ml-1 text-danger">*</span> : null}
	                                  {fv.field_type !== "checkbox" && (
	                                    <span className="ml-1 text-muted-foreground/60">
	                                      ({FIELD_TYPE_LABELS[fv.field_type]})
	                                    </span>
	                                  )}
	                                </label>
	                                {fv.field_type === "checkbox" ? (
	                                  <label className="flex cursor-pointer items-center gap-2">
	                                    <input
	                                      type="checkbox"
	                                      checked={editedValue === "true"}
	                                      onChange={(e) =>
	                                        setFieldValueEdits((prev) => ({
	                                          ...prev,
	                                          [fv.field_key]: e.target.checked ? "true" : "false",
	                                        }))
	                                      }
	                                      className="h-4 w-4 accent-accent"
	                                    />
	                                    <span className="text-sm">{fv.label}</span>
	                                  </label>
	                                ) : fv.field_type === "select" ? (
                                  <AppSelect
                                    value={editedValue ?? ""}
                                    onChange={(e) =>
                                      setFieldValueEdits((prev) => ({
                                        ...prev,
                                        [fv.field_key]: e.target.value || null,
                                      }))
                                    }
                                  >
                                    <option value="">{fv.placeholder ?? "Выберите значение"}</option>
                                    {(fv.options ?? []).map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </AppSelect>
	                                ) : (
	                                  <AppInput
	                                    type={fv.field_type === "number" ? "number" : fv.field_type === "date" ? "date" : "text"}
	                                    value={editedValue ?? ""}
	                                    onChange={(e) =>
	                                      setFieldValueEdits((prev) => ({
	                                        ...prev,
	                                        [fv.field_key]: e.target.value || null,
	                                      }))
	                                    }
	                                    placeholder={fv.placeholder ?? fv.label}
	                                  />
	                                )}
	                              </div>
	                            );
                          })}
                          {Object.keys(fieldValueEdits).length > 0 && (
                            <div className="flex gap-2 pt-1">
                              <AppButton
                                type="button"
                                size="sm"
                                disabled={fieldValuesSaving}
                                onClick={() => void handleSaveFieldValues()}
                              >
                                Сохранить поля
                              </AppButton>
                              <AppButton
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setFieldValueEdits({})}
                              >
                                Отмена
                              </AppButton>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </section>
                )}

                {/* ── 8. Напоминания ─────────────────────────────────────── */}
                <section className={sectionClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Напоминания</h3>
                    {!isCreateMode && orderId ? (
                      <span className="text-xs text-muted-foreground">{(orderRemindersQuery.data ?? []).length} шт.</span>
                    ) : null}
                  </div>

                  {isCreateMode ? (
                    <div className={cn("mt-4 px-4 py-6 text-sm text-muted-foreground", isModernDesktop ? "rounded-xl bg-surface-2/50" : "rounded-2xl border border-dashed border-border")}>
                      Сначала сохраните заказ, затем добавьте напоминание.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <Field label="Текст напоминания">
                        <AppTextarea rows={3} placeholder="Например: позвонить клиенту и согласовать выдачу" value={reminderText} onChange={(e) => setReminderText(e.target.value)} />
                      </Field>
                      <Field label="Дата и время">
                        <AppInput className="min-w-0 max-w-full" type="datetime-local" value={reminderDueAt} onChange={(e) => setReminderDueAt(e.target.value)} />
                      </Field>
                      <div className="flex justify-start">
                        <AppButton type="button" disabled={!reminderText.trim() || !reminderDueAt || createOrderReminderMutation.isPending} onClick={() => void handleCreateReminder()}>
                          Создать напоминание
                        </AppButton>
                      </div>

                      {orderRemindersQuery.isLoading ? (
                        <LoadingState title="Загружаем напоминания" description="Подготавливаем список напоминаний по заказу." />
                      ) : null}
                      {orderRemindersQuery.isError ? (
                        <ErrorState title="Не удалось загрузить напоминания" description="Попробуйте обновить карточку заказа." actionLabel="Повторить" onAction={() => void orderRemindersQuery.refetch()} />
                      ) : null}

                      {orderRemindersQuery.data?.length ? (
                        <div className="space-y-3">
                          {orderRemindersQuery.data.map((reminder) => (
                            <div key={reminder.id} className={cn("p-3", insetCardClassName)}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">{reminder.text}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {formatDateTime(reminder.due_at)}
                                    {reminder.is_overdue ? " · Просрочено" : ""}
                                  </div>
                                </div>
                                <StatusBadge label={getReminderStatusLabel(reminder.status, reminder)} tone={getReminderStatusTone(reminder.status, undefined, reminder)} />
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <AppButton type="button" size="sm" variant="outline" onClick={() => navigate(`/notifications?scope=all&reminder=${reminder.id}`)}>
                                  Открыть
                                </AppButton>
                                <AppButton type="button" size="sm" variant="outline" disabled={doneReminderMutation.isPending || reminder.status === "done"} onClick={() => void doneReminderMutation.mutateAsync(reminder.id)}>
                                  Завершить
                                </AppButton>
                                <AppButton type="button" size="sm" variant="ghost" disabled={deleteReminderMutation.isPending} onClick={() => {
                                  if (!window.confirm("Удалить напоминание?")) return;
                                  void deleteReminderMutation.mutateAsync(reminder.id);
                                }}>
                                  Удалить
                                </AppButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : !orderRemindersQuery.isLoading && !orderRemindersQuery.isError ? (
                        <div className={cn("px-4 py-6 text-sm text-muted-foreground", isModernDesktop ? "rounded-xl bg-surface-2/50" : "rounded-2xl border border-dashed border-border")}>
                          По этому заказу пока нет напоминаний.
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>

                {/* ── 9. История ─────────────────────────────────────────── */}
                {!isCreateMode && order?.status_history.length ? (
                  <section className={cn(sectionClassName, "last:border-b-0")}>
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">История изменений</h3>
                    </div>
                    <div className="mt-4 space-y-2">
                      {[...order.status_history].reverse().map((entry, index) => (
                        <div
                          key={`${entry.status}:${entry.changed_at}:${index}`}
                          className="flex items-center gap-3 text-sm"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                          <span className="text-foreground">{statusLabels[entry.status] ?? entry.status}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.changed_at)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {saveMessage ? <p className="text-sm text-accent">{saveMessage}</p> : null}
                {createOrderMutation.isError || updateOrderMutation.isError || createOrderReminderMutation.isError ? (
                  <p className="text-sm text-danger">
                    {createOrderMutation.error?.message ?? updateOrderMutation.error?.message ?? createOrderReminderMutation.error?.message ?? "Не удалось сохранить изменения"}
                  </p>
                ) : null}
              </form>
            </>
          ) : null}
        </div>

        {/* в”Ђв”Ђ Footer в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
        <div
            className={cn(
              "mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5",
              isMobile && "px-4 py-3",
              isModernDesktop && "sticky bottom-0 z-[1] bg-background/95 backdrop-blur"
            )}
          >
          <div className={cn("space-y-3", isMobile && "space-y-2")}>
            <UnsavedChangesBanner
              visible={isWarningVisible}
              onDismiss={dismissWarning}
              onCloseWithoutSaving={() => {
                dismissWarning();
                onClose();
              }}
            />
            {isMobile ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-muted-foreground">К оплате</span>
                  <span className="text-lg font-semibold text-foreground">{formatCurrency(totalAfterDiscount)}</span>
                </div>
                <div className="flex w-full min-w-0 gap-2 overflow-hidden">
                  {(isCreateMode ? canCreateOrder : canEditOrder) ? (
                    <AppButton
                      className="min-w-0 flex-[2]"
                      type="button"
                      onClick={() => void onSubmit()}
                      disabled={createOrderMutation.isPending || updateOrderMutation.isPending || createOrderReminderMutation.isPending}
                    >
                      {isCreateMode ? "Создать заказ" : "Сохранить заказ"}
                    </AppButton>
                  ) : null}
                  <AppButton className="min-w-0 flex-1" type="button" variant="outline" onClick={requestClose}>
                    Отменить
                  </AppButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">К оплате</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-foreground">{formatCurrency(totalAfterDiscount)}</div>
                </div>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <AppButton type="button" variant="outline" onClick={requestClose}>
                    Отменить
                  </AppButton>
                  {(isCreateMode ? canCreateOrder : canEditOrder) ? (
                    <AppButton
                      type="button"
                      onClick={() => void onSubmit()}
                      disabled={createOrderMutation.isPending || updateOrderMutation.isPending || createOrderReminderMutation.isPending}
                    >
                      {isCreateMode ? "Создать заказ" : "Сохранить заказ"}
                    </AppButton>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* в”Ђв”Ђ Nested panels в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      <ClientDetailPanel
        isMobile={isMobile}
        clientKey={nestedClientKey}
        onClose={() => setNestedClientKey(null)}
        onCreated={(clientId) => {
          if (nestedClientTarget === "payer") {
            form.setValue("payer_client_id", clientId, { shouldDirty: true, shouldValidate: true });
            setIsPayerEditing(true);
          } else if (nestedClientTarget === "owner") {
            setOwnerFilterClientId(clientId);
            setNestedVehicleKey("new");
          } else {
            form.setValue("client_id", clientId, { shouldDirty: true, shouldValidate: true });
            setIsClientEditing(true);
            setNestedVehicleKey("new");
          }
          setNestedClientTarget(null);
        }}
        onOpenVehicle={(vehicleKey) => setNestedVehicleKey(vehicleKey)}
        onVehicleClose={() => setNestedVehicleKey(null)}
        onVehicleCreated={(vehicleId) => {
          setPendingCreatedVehicleId(vehicleId);
          form.setValue("vehicle_id", vehicleId, { shouldDirty: true, shouldValidate: true });
          setNestedVehicleKey(null);
        }}
        vehicleKey={nestedVehicleKey}
      />
      <VehicleDetailPanel
        clientPresetId={vehicleClientPresetId}
        isMobile={isMobile}
        vehicleKey={nestedClientKey ? null : nestedVehicleKey}
        onClose={() => setNestedVehicleKey(null)}
        onCreated={(vehicleId) => {
          setPendingCreatedVehicleId(vehicleId);
          form.setValue("vehicle_id", vehicleId, { shouldDirty: true, shouldValidate: true });
          setNestedVehicleKey(null);
        }}
      />
    </>
  );

  if (isMobile) {
    return (
      <MobileSheet closeOnBackdropClick={false} onClose={requestClose}>
        {content}
      </MobileSheet>
    );
  }

  if (desktopMode === "overlay") {
    return (
      <div
        className="fixed inset-0 z-[250] hidden bg-black/70 backdrop-blur-sm lg:block"
        onPointerDown={handleBackdropPointerDown}
        onPointerCancel={handleBackdropPointerCancel}
        onClick={handleBackdropClick}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[250] hidden bg-black/56 backdrop-blur-[2px] lg:block"
      onPointerDown={handleBackdropPointerDown}
      onPointerCancel={handleBackdropPointerCancel}
      onClick={handleBackdropClick}
    >
      {content}
    </div>
  );
}

function Field({ children, error, label }: { children: ReactNode; error?: string; label: ReactNode }) {
  return (
    <div className="block space-y-2">
      {label ? <div className="text-sm font-medium text-foreground">{label}</div> : null}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function IconActionButton({
  accent = false,
  ariaLabel,
  children,
  onClick
}: {
  accent?: boolean;
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition",
        accent
          ? "border-accent bg-accent text-accent-foreground hover:bg-accent-hover"
          : "border-border/80 bg-surface text-foreground hover:border-border hover:bg-surface-2"
      )}
    >
      {children}
    </button>
  );
}
