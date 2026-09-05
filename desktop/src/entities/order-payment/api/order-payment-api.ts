import { apiRequest } from "@/shared/api/client";
import type {
  OrderPayment,
  OrderPaymentPayload,
  OrderPaymentUpdatePayload
} from "@/entities/order-payment/model/types";

export function listOrderPaymentsRequest(orderId: number) {
  return apiRequest<OrderPayment[]>(`/orders/${orderId}/payments`);
}

export function createOrderPaymentRequest(orderId: number, payload: OrderPaymentPayload, idempotencyKey: string) {
  return apiRequest<OrderPayment>(`/orders/${orderId}/payments`, {
    method: "POST",
    body: payload,
    headers: { "Idempotency-Key": idempotencyKey }
  });
}

export function updateOrderPaymentRequest(orderId: number, paymentId: number, payload: OrderPaymentUpdatePayload) {
  return apiRequest<OrderPayment>(`/orders/${orderId}/payments/${paymentId}`, {
    method: "PUT",
    body: payload
  });
}

export function deleteOrderPaymentRequest(orderId: number, paymentId: number) {
  return apiRequest<void>(`/orders/${orderId}/payments/${paymentId}`, {
    method: "DELETE"
  });
}
