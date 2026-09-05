import type { OrderPayment, OrderPaymentStatus } from "@/entities/order-payment/model/types";

// Code from crm_order_statuses.code.
// Canonical codes: "new", "in_progress", "done", "closed", "cancelled".
export type OrderStatus = string;
export type OrderDiscountType = "fixed" | "percent";

export type OrderStatusHistoryEntry = {
  changed_at: string;
  status: OrderStatus;
};

export type OrderClientSummary = {
  full_name: string;
  id: number;
  phone_display: string;
};

export type OrderVehicleSummary = {
  brand: string | null;
  client_id: number;
  display_name: string;
  id: number;
  model: string | null;
  plate_number_display: string;
  vin: string | null;
};

export type OrderServiceItem = {
  category_name_snapshot: string | null;
  id: number;
  quantity: number;
  row_total: string;
  service_catalog_id: number | null;
  service_name_snapshot: string;
  sort_key: number;
  unit_price: string;
};

export type Order = {
  amount_to_pay: string;
  client_id: number;
  comment: string | null;
  completed_at: string | null;
  due_date: string | null;
  scheduled_for: string | null;
  handover_at: string | null;
  discount_type: OrderDiscountType;
  discount_value: string;
  id: number;
  is_archived: boolean;
  balance_due: string;
  paid_total: string;
  payment_status: OrderPaymentStatus;
  payments: OrderPayment[];
  client_summary: OrderClientSummary;
  payer_client_id?: number | null;
  services: OrderServiceItem[];
  services_total: string;
  status: OrderStatus;
  status_display_name: string;
  status_group: string;
  status_color: string;
  status_history: OrderStatusHistoryEntry[];
  vehicle_summary: OrderVehicleSummary;
  vehicle_id: number;
};

export type OrderSummary = {
  amount_to_pay: string;
  category_colors: string[];
  client_full_name: string;
  client_id: number;
  client_phone: string;
  payer_client_id?: number | null;
  comment: string | null;
  completed_at: string | null;
  due_date: string | null;
  scheduled_for: string | null;
  handover_at: string | null;
  discount_type: OrderDiscountType;
  discount_value: string;
  id: number;
  is_archived: boolean;
  balance_due: string;
  paid_total: string;
  payment_status: OrderPaymentStatus;
  primary_category_color: string | null;
  primary_category_name: string | null;
  service_names: string[];
  services_total: string;
  status: OrderStatus;
  status_display_name: string;
  status_group: string;
  status_color: string;
  status_changed_at: string | null;
  updated_at?: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_id: number;
  vehicle_plate_number: string;
  vehicle_vin: string | null;
};

export type OrderListSummary = {
  active_amount_to_pay: string;
  active_in_progress_total: number;
  active_total: number;
  active_waiting_total: number;
  archived_total: number;
  status_counts: Record<string, number>;
  total: number;
};

export type OrderServicePayload = {
  category_name_snapshot: string | null;
  quantity: number;
  service_catalog_id: number | null;
  service_name_snapshot: string;
  sort_key: number;
  unit_price: string;
};

export type OrderUpdatePayload = {
  client_id: number;
  comment: string | null;
  due_date: string | null;
  scheduled_for: string | null;
  handover_at: string | null;
  discount_type: OrderDiscountType;
  discount_value: string;
  payer_client_id: number | null;
  services: OrderServicePayload[];
  status: OrderStatus;
  vehicle_id: number;
};

export type OrderCreatePayload = OrderUpdatePayload;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  cancelled: "Отменён",
  closed: "Выдан",
  done: "Готово",
  in_progress: "В работе",
  new: "Новый"
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
  label,
  value: value as OrderStatus
}));
