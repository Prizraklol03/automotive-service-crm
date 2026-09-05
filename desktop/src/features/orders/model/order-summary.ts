import type { OrderSummary } from "@/entities/order/model/types";

export function calculateActivePayableAmount(orders: OrderSummary[]) {
  return orders
    .filter((order) => !order.is_archived && order.status !== "new")
    .reduce((sum, order) => sum + Number(order.amount_to_pay), 0);
}
