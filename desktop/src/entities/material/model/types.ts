export type Material = {
  expense_date: string;
  attachments_count: number;
  id: number;
  material_name: string;
  quantity: number;
  row_total: string;
  service_category_id: number | null;
  service_category_name: string | null;
  unit_price: string;
};

export type MaterialCategorySummary = {
  amount: string;
  categoryId: number | null;
  name: string;
  rows: number;
};

export type MaterialListSummary = {
  categories: MaterialCategorySummary[];
  total_amount: string;
};

export type MaterialAttachment = {
  created_at: string;
  created_by_user_id: number | null;
  file_name: string;
  id: number;
  material_id: number;
  mime_type: string;
  size: number;
};

export type MaterialPayload = {
  expense_date: string;
  material_name: string;
  quantity: number;
  service_category_id: number | null;
  unit_price: string;
};

export type MaterialsFilters = {
  dateFrom?: string;
  dateTo?: string;
};
