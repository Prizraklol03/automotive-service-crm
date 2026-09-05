export type ModuleKey =
  | "photos"
  | "customer_payer"
  | "scheduler"
  | "warehouse"
  | "vin_catalog"
  | "labor_norms"
  | "salary"
  | "maintenance_schedule"
  | "kanban"
  | "online_booking"
  | "client_portal";

export type ModulesConfig = Record<ModuleKey, boolean>;

export const DEFAULT_MODULES_CONFIG: ModulesConfig = {
  photos: false,
  customer_payer: false,
  scheduler: false,
  warehouse: false,
  vin_catalog: false,
  labor_norms: false,
  salary: false,
  maintenance_schedule: false,
  kanban: false,
  online_booking: false,
  client_portal: false
};

export type AppSettings = {
  generated_storage_path: string;
  next_document_number: number;
  templates_storage_path: string;
};

export type DocumentNumbering = {
  next_document_number: number;
};

export type VehicleCatalogStatus = {
  brand_count: number;
  last_synced_at: string | null;
  model_count: number;
  monthly_sync_enabled: boolean;
  provider: string;
  sync_interval_days: number;
};

export type VehicleCatalogSyncResult = VehicleCatalogStatus & {
  brands_added: number;
  brands_skipped: number;
  brands_updated: number;
  completed_at: string;
  fetch_errors: number;
  models_added: number;
  models_skipped: number;
  models_updated: number;
  processed_brand_count: number;
  processed_model_count: number;
  started_at: string;
};

export type OrderSortPreference = {
  direction: "asc" | "desc";
  key:
    | "status"
    | "scheduled_for"
    | "id"
    | "updated_at"
    | "amount_to_pay"
    | "client_full_name"
    | "vehicle_plate_number"
    | "vehicle_brand"
    | "vehicle_model";
};

export type UserPreferences = {
  order_sorting: OrderSortPreference[];
};

export type UserPreferencesUpdatePayload = UserPreferences;

// Order Status Config

export type StatusGroup = "new" | "in_progress" | "done" | "closed" | "cancelled";

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  new: "Новый",
  in_progress: "В работе",
  done: "Готово",
  closed: "Выдан",
  cancelled: "Отменён",
};

export const STATUS_GROUP_DESCRIPTIONS: Record<StatusGroup, string> = {
  new: "Создан, работа не начата",
  in_progress: "Активная работа над заказом",
  done: "Работа завершена, не выдан",
  closed: "Выдан клиенту, оборот зафиксирован",
  cancelled: "Отменён",
};

export const STATUS_GROUP_ORDER: StatusGroup[] = ["new", "in_progress", "done", "closed", "cancelled"];

export const ARCHIVED_GROUPS: StatusGroup[] = ["closed", "cancelled"];

export type CrmOrderStatus = {
  code: string;
  display_name: string;
  status_group: StatusGroup;
  color: string;
  sort_order: number;
  is_default: boolean;
};

export function sortStatusesBySortOrder(statuses: CrmOrderStatus[]) {
  return [...statuses].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.code.localeCompare(right.code);
  });
}

export type OrderStatusCreatePayload = {
  display_name: string;
  status_group: StatusGroup;
  color: string;
  is_default: boolean;
  sort_order?: number;
};

export type OrderStatusUpdatePayload = {
  display_name: string;
  status_group: StatusGroup;
  color: string;
  is_default: boolean;
  sort_order: number;
};

// Visual Config

// Stores dynamic status-code to hue mappings.
export type StatusColorsConfig = Record<string, number | null>;

export type UIDensity = "comfortable" | "compact";

export type VisualConfig = {
  accent_hue: number | null;   // 0-360, null = default (91 green)
  status_colors: StatusColorsConfig | null;
  ui_density: UIDensity | null;
  preset: string | null;
  working_month_start_day: number;
};

export const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  accent_hue: null,
  status_colors: null,
  ui_density: null,
  preset: null,
  working_month_start_day: 25,
};

/** Default HSL hue per legacy order status code (fallback when no custom color set) */
export const DEFAULT_STATUS_HUES: Record<string, number | null> = {
  new: null,
  in_progress: 91,
  done: 142,
  closed: 180,
  cancelled: 5,
};

// Custom Fields

export type FieldType = "text" | "number" | "select" | "checkbox" | "date";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Текст",
  number: "Число",
  select: "Список",
  checkbox: "Флажок",
  date: "Дата",
};

export type CustomFieldDef = {
  key: string;
  label: string;
  field_type: FieldType;
  is_required: boolean;
  sort_order: number;
  placeholder: string | null;
  options: string[] | null;
};

export type CustomFieldDefCreatePayload = {
  label: string;
  field_type: FieldType;
  is_required: boolean;
  sort_order?: number;
  placeholder?: string | null;
  options?: string[] | null;
};

export type CustomFieldDefUpdatePayload = {
  label: string;
  field_type: FieldType;
  is_required: boolean;
  sort_order: number;
  placeholder: string | null;
  options: string[] | null;
};

export type OrderFieldValue = {
  field_key: string;
  value: string | null;
  label: string;
  field_type: FieldType;
  is_required: boolean;
  placeholder: string | null;
  options: string[] | null;
  sort_order: number;
};

export type OrderFieldValuesPayload = {
  values: Record<string, string | null>;
};

// Presets

export type PresetStatusDef = {
  display_name: string;
  status_group: StatusGroup;
  color: string;
  is_default: boolean;
  sort_order: number;
};

export type StatusPreset = {
  name: string;
  label: string;
  description: string;
  statuses: PresetStatusDef[];
};

export type PresetApplyResult = {
  preset_name: string;
  statuses: CrmOrderStatus[];
};
