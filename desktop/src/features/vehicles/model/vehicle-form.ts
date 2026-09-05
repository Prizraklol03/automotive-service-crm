import { z } from "zod";

import type { Vehicle, VehiclePayload } from "@/entities/vehicle/model/types";

function toUpperInput(value: string) {
  return value.toUpperCase();
}

export const vehicleFormSchema = z.object({
  brand_id: z.number().int().nullable(),
  brand_name: z.string().max(128),
  client_id: z.number().int().min(1, "Выберите клиента"),
  color: z.string().max(64),
  comment: z.string().max(5000),
  mileage: z.number().int().min(0).nullable(),
  model_id: z.number().int().nullable(),
  model_name: z.string().max(128),
  plate_number: z.string().trim().min(1, "Введите госномер").max(32),
  vin: z.string().max(32),
  year: z.number().int().nullable()
});

export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

export function createEmptyVehicleFormValues(clientId = 0): VehicleFormValues {
  return {
    brand_id: null,
    brand_name: "",
    client_id: clientId,
    color: "",
    comment: "",
    mileage: null,
    model_id: null,
    model_name: "",
    plate_number: "",
    vin: "",
    year: null
  };
}

export function mapVehicleToFormValues(vehicle: Vehicle): VehicleFormValues {
  return {
    brand_id: vehicle.brand_id,
    brand_name: vehicle.brand ?? "",
    client_id: vehicle.client_id,
    color: vehicle.color ?? "",
    comment: vehicle.comment ?? "",
    mileage: vehicle.mileage,
    model_id: vehicle.model_id,
    model_name: vehicle.model ?? "",
    plate_number: vehicle.plate_number_display,
    vin: vehicle.vin ?? "",
    year: vehicle.year
  };
}

export function mapFormValuesToVehiclePayload(values: VehicleFormValues): VehiclePayload {
  const brandName = values.brand_name.trim();
  const modelName = toUpperInput(values.model_name.trim());

  return {
    brand: values.brand_id ? null : brandName || null,
    brand_id: values.brand_id,
    client_id: values.client_id,
    color: values.color.trim() ? toUpperInput(values.color.trim()) : null,
    comment: values.comment.trim() ? values.comment.trim() : null,
    mileage: values.mileage,
    model: values.model_id ? null : modelName || null,
    model_id: values.model_id,
    plate_number: toUpperInput(values.plate_number.trim()),
    vin: values.vin.trim() ? toUpperInput(values.vin.trim()) : null,
    year: values.year
  };
}
