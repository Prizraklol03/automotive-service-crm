import { z } from "zod";

import type { Order, OrderStatus, OrderUpdatePayload } from "@/entities/order/model/types";
import { toApiLocalDateTime, toLocalDateTimeInputValue } from "@/shared/lib/datetime";

const serviceRowSchema = z.object({
  category_id: z.number().int().nullable(),
  category_name_snapshot: z.string().trim().max(255).nullable(),
  quantity: z.number().int().min(1, "Минимум 1"),
  service_catalog_id: z.number().int().nullable(),
  service_name_snapshot: z.string().trim().min(1, "Выберите услугу").max(255),
  sort_key: z.number().int().min(0),
  unit_price: z.number().min(0, "Цена не может быть отрицательной"),
});

export const orderFormSchema = z.object({
  client_id: z.number().int().min(1, "Выберите клиента"),
  comment: z.string().max(5000),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Некорректная дата и время").or(z.literal("")),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Некорректная дата и время").or(z.literal("")),
  handover_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Некорректная дата и время").or(z.literal("")),
  discount_value: z.number().min(0, "Скидка не может быть отрицательной"),
  discount_type: z.enum(["fixed", "percent"]),
  payer_client_id: z.number().int().nullable(),
  services: z.array(serviceRowSchema),
  status: z.string().min(1, "Выберите статус"),
  vehicle_id: z.number().int().min(1, "Выберите автомобиль"),
});

export type OrderFormValues = z.infer<typeof orderFormSchema>;

function toNumberString(value: number) {
  return value.toFixed(2);
}

export function createEmptyOrderFormValues(clientId = 0, vehicleId = 0, status: OrderStatus = "new"): OrderFormValues {
  return {
    client_id: clientId,
    comment: "",
    due_date: "",
    scheduled_for: "",
    handover_at: "",
    discount_value: 0,
    discount_type: "fixed",
    payer_client_id: null,
    services: [],
    status,
    vehicle_id: vehicleId,
  };
}

export function mapOrderToFormValues(order: Order): OrderFormValues {
  return {
    client_id: order.client_id,
    comment: order.comment ?? "",
    due_date: toLocalDateTimeInputValue(order.due_date),
    scheduled_for: toLocalDateTimeInputValue(order.scheduled_for),
    handover_at: toLocalDateTimeInputValue(order.handover_at),
    discount_value: Number(order.discount_value),
    discount_type: order.discount_type,
    payer_client_id: order.payer_client_id ?? null,
    services: order.services.map((service) => ({
      category_id: null,
      category_name_snapshot: service.category_name_snapshot,
      quantity: service.quantity,
      service_catalog_id: service.service_catalog_id,
      service_name_snapshot: service.service_name_snapshot,
      sort_key: service.sort_key,
      unit_price: Number(service.unit_price),
    })),
    status: order.status,
    vehicle_id: order.vehicle_id,
  };
}

export function mapFormValuesToOrderPayload(values: OrderFormValues): OrderUpdatePayload {
  return {
    client_id: values.client_id,
    comment: values.comment.trim() ? values.comment.trim() : null,
    due_date: values.due_date ? toApiLocalDateTime(values.due_date) : null,
    scheduled_for: values.scheduled_for ? toApiLocalDateTime(values.scheduled_for) : null,
    handover_at: values.handover_at ? toApiLocalDateTime(values.handover_at) : null,
    discount_value: toNumberString(values.discount_value),
    discount_type: values.discount_type,
    payer_client_id: values.payer_client_id && values.payer_client_id !== values.client_id ? values.payer_client_id : null,
    services: values.services.map((service, index) => ({
      category_name_snapshot: service.category_name_snapshot?.trim() ? service.category_name_snapshot.trim() : null,
      quantity: service.quantity,
      service_catalog_id: service.service_catalog_id,
      service_name_snapshot: service.service_name_snapshot.trim(),
      sort_key: index,
      unit_price: toNumberString(service.unit_price),
    })),
    status: values.status,
    vehicle_id: values.vehicle_id,
  };
}
