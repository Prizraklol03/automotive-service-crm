export type ExternalLeadStatus = "new" | "in_work" | "closed" | "spam";

export type ExternalLeadSummary = {
  inWorkCount: number;
  newCount: number;
  totalOpenCount: number;
};

export type ExternalLeadListItem = {
  client_display_name: string | null;
  client_id: number | null;
  created_at: string;
  created_order_id: number | null;
  customer_name: string | null;
  customer_phone_raw: string;
  dedupe_status: string;
  display_name: string;
  duplicate_count: number;
  form_name: string | null;
  id: number;
  integration_source_id: number;
  integration_source_name: string | null;
  last_duplicate_at: string | null;
  message: string | null;
  package_name: string | null;
  page_url: string | null;
  phone_normalized: string;
  service_name: string | null;
  source_block: string | null;
  source_name: string | null;
  source_type: string | null;
  status: ExternalLeadStatus;
  updated_at: string;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_medium: string | null;
  utm_source: string | null;
  utm_term: string | null;
};

export type ExternalLeadDetail = ExternalLeadListItem & {
  raw_payload: Record<string, unknown> | null;
};
