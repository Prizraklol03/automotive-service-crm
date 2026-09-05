import { apiRequest } from "@/shared/api/client";
import type { CarBrand, CarModel } from "@/entities/reference/model/types";

export function listCarBrandsRequest() {
  return apiRequest<CarBrand[]>("/car-brands");
}

export function listCarModelsByBrandRequest(brandId: number) {
  return apiRequest<CarModel[]>(`/car-models/by-brand/${brandId}`);
}
