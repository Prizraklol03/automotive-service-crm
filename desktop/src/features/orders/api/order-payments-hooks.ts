import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOrderPaymentRequest,
  deleteOrderPaymentRequest,
  listOrderPaymentsRequest,
  updateOrderPaymentRequest
} from "@/entities/order-payment/api/order-payment-api";
import type { OrderPayment } from "@/entities/order-payment/model/types";
import type {
  OrderPaymentPayload,
  OrderPaymentUpdatePayload
} from "@/entities/order-payment/model/types";

export function orderPaymentsQueryKey(orderId: number) {
  return ["orders", "payments", orderId] as const;
}

export function useOrderPaymentsQuery(orderId: number | null, initialPayments?: OrderPayment[]) {
  return useQuery({
    queryKey: orderId ? orderPaymentsQueryKey(orderId) : ["orders", "payments", "empty"],
    queryFn: () => listOrderPaymentsRequest(orderId as number),
    enabled: orderId !== null,
    placeholderData: initialPayments
  });
}

export function useCreateOrderPaymentMutation(orderId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: OrderPaymentPayload; idempotencyKey: string }) =>
      createOrderPaymentRequest(orderId as number, payload, idempotencyKey),
    onSuccess: async () => {
      if (orderId !== null) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["orders"] }),
          queryClient.invalidateQueries({ queryKey: orderPaymentsQueryKey(orderId) })
        ]);
      }
    }
  });
}

export function useUpdateOrderPaymentMutation(orderId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId, payload }: { paymentId: number; payload: OrderPaymentUpdatePayload }) =>
      updateOrderPaymentRequest(orderId as number, paymentId, payload),
    onSuccess: async () => {
      if (orderId !== null) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["orders"] }),
          queryClient.invalidateQueries({ queryKey: orderPaymentsQueryKey(orderId) })
        ]);
      }
    }
  });
}

export function useDeleteOrderPaymentMutation(orderId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentId: number) => deleteOrderPaymentRequest(orderId as number, paymentId),
    onSuccess: async () => {
      if (orderId !== null) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["orders"] }),
          queryClient.invalidateQueries({ queryKey: orderPaymentsQueryKey(orderId) })
        ]);
      }
    }
  });
}
