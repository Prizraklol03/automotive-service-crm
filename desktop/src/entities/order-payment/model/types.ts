export type OrderPaymentMethod = "cash" | "card" | "transfer" | "other";
export type OrderPaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export type OrderPayment = {
  amount: string;
  comment: string | null;
  created_at: string;
  created_by_user_id: number | null;
  id: number;
  order_id: number;
  payment_date: string;
  payment_method: OrderPaymentMethod;
  updated_at: string;
};

export type OrderPaymentPayload = {
  amount: string;
  comment: string | null;
  payment_date: string;
  payment_method: OrderPaymentMethod;
};

export type OrderPaymentUpdatePayload = OrderPaymentPayload;

export const ORDER_PAYMENT_METHOD_LABELS: Record<OrderPaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  other: "Другое",
  transfer: "Перевод"
};

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  unpaid: "Не оплачено",
  partial: "Частично",
  paid: "Оплачено",
  overpaid: "Переплата"
};

export const ORDER_PAYMENT_STATUS_TONES: Record<OrderPaymentStatus, "accent" | "danger" | "muted" | "success" | "warning"> = {
  unpaid: "muted",
  partial: "warning",
  paid: "success",
  overpaid: "danger"
};

export function getOrderPaymentMethodLabel(method: OrderPaymentMethod) {
  return ORDER_PAYMENT_METHOD_LABELS[method];
}

export function getOrderPaymentStatusLabel(status: OrderPaymentStatus) {
  return ORDER_PAYMENT_STATUS_LABELS[status];
}

export function getOrderPaymentStatusTone(status: OrderPaymentStatus) {
  return ORDER_PAYMENT_STATUS_TONES[status];
}
