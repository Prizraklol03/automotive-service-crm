export type ClientType = "individual" | "legal";

export type Client = {
  address: string | null;
  comment: string | null;
  deleted_at: string | null;
  client_type?: ClientType | null;
  company_name: string | null;
  display_label?: string;
  full_name: string;
  id: number;
  inn: string | null;
  is_individual?: boolean;
  is_legal?: boolean;
  is_deleted: boolean;
  kpp: string | null;
  legal_address: string | null;
  actual_address: string | null;
  phone_display: string;
  phone_normalized: string;
  ogrn: string | null;
  representative_basis: string | null;
  representative_full_name: string | null;
  representative_position: string | null;
  telegram_username: string | null;
};

export type ClientPayload = {
  address: string | null;
  comment: string | null;
  client_type: ClientType;
  company_name: string | null;
  full_name: string;
  inn: string | null;
  kpp: string | null;
  legal_address: string | null;
  actual_address: string | null;
  ogrn: string | null;
  representative_basis: string | null;
  representative_full_name: string | null;
  representative_position: string | null;
  phone: string;
  telegram_username: string | null;
};

export type ClientOrderHistory = {
  orders: import("@/entities/order/model/types").OrderSummary[];
};

export type ClientDetail = Client & {
  orders: import("@/entities/order/model/types").OrderSummary[];
};

export function normalizeClientType(clientType: Client["client_type"]): ClientType {
  return clientType === "legal" ? "legal" : "individual";
}

export function getClientDisplayLabel(client: Pick<Client, "client_type" | "company_name" | "full_name" | "phone_display">): string {
  if (normalizeClientType(client.client_type) === "legal") {
    return client.company_name?.trim() || client.full_name?.trim() || client.phone_display;
  }

  return client.full_name?.trim() || client.phone_display;
}
