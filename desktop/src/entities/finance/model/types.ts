export type FinanceCategory = {
  id: number;
  name: string;
};

export type FinanceCategoryPayload = {
  name: string;
};

export type FinanceExpense = {
  amount: string;
  category_id: number;
  category_name: string;
  comment: string;
  created_by_user_id: number | null;
  created_by_user_name: string | null;
  expense_date: string;
  id: number;
};

export type FinanceExpenseAttachment = {
  created_at: string;
  created_by_user_id: number | null;
  expense_id: number;
  file_name: string;
  id: number;
  mime_type: string;
  size: number;
};

export type FinanceExpensePayload = {
  amount: string;
  category_id: number;
  comment: string;
  expense_date: string;
};

export type FinanceExpensesFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type FinanceExpensesSummary = {
  total_amount: string;
};
