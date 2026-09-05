import { z } from "zod";

import type {
  ServiceCatalogItem,
  ServiceCatalogPayload,
  ServiceCategory,
  ServiceCategoryPayload
} from "@/entities/service/model/types";

export const serviceFormSchema = z.object({
  category_id: z.number().int().min(1, "Выберите категорию"),
  default_price: z.number().min(1, "Цена должна быть больше 0"),
  is_active: z.boolean(),
  name: z.string().trim().min(1, "Введите название услуги").max(255)
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const serviceCategoryFormSchema = z.object({
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Введите цвет в формате #RRGGBB"),
  is_active: z.boolean(),
  name: z.string().trim().min(1, "Введите название категории").max(255),
  sort_order: z.number().int().min(0)
});

export type ServiceCategoryFormValues = z.infer<typeof serviceCategoryFormSchema>;

function toDecimalString(value: number) {
  return value.toFixed(2);
}

export function mapServiceToFormValues(service: ServiceCatalogItem): ServiceFormValues {
  return {
    category_id: service.category_id,
    default_price: Number(service.default_price),
    is_active: service.is_active,
    name: service.name
  };
}

export function mapFormValuesToServicePayload(values: ServiceFormValues): ServiceCatalogPayload {
  return {
    category_id: values.category_id,
    default_price: toDecimalString(values.default_price),
    is_active: values.is_active,
    name: values.name.trim()
  };
}

export function mapCategoryToFormValues(category: ServiceCategory): ServiceCategoryFormValues {
  return {
    color: category.color,
    is_active: category.is_active,
    name: category.name,
    sort_order: category.sort_order
  };
}

export function mapFormValuesToCategoryPayload(values: ServiceCategoryFormValues): ServiceCategoryPayload {
  return {
    color: values.color.trim().toUpperCase(),
    is_active: values.is_active,
    name: values.name.trim(),
    sort_order: values.sort_order
  };
}
