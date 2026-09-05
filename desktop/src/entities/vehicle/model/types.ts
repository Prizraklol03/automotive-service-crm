export type Vehicle = {
  brand: string | null;
  brand_id: number | null;
  client_id: number;
  color: string | null;
  comment: string | null;
  deleted_at: string | null;
  id: number;
  is_deleted: boolean;
  mileage: number | null;
  model: string | null;
  model_id: number | null;
  plate_number_display: string;
  plate_number_normalized: string;
  vin: string | null;
  year: number | null;
};

export type VehiclePayload = {
  brand: string | null;
  brand_id: number | null;
  client_id: number;
  color: string | null;
  comment: string | null;
  mileage: number | null;
  model: string | null;
  model_id: number | null;
  plate_number: string;
  vin: string | null;
  year: number | null;
};

export type VehicleOwnerHistoryEntry = {
  client_full_name: string;
  client_id: number;
  comment: string | null;
  id: number;
  owned_from: string;
  owned_to: string | null;
  status: "current" | "former";
  title: string;
};

export type VehicleDetail = Vehicle & {
  current_owner_full_name: string;
  current_owner_phone_display: string;
  orders: import("@/entities/order/model/types").OrderSummary[];
  owner_history: VehicleOwnerHistoryEntry[];
};
