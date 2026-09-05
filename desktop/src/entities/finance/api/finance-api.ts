import { apiDownload, apiRequest } from "@/shared/api/client";
import type { PaginatedResponse } from "@/shared/model/pagination";
import type {
  FinanceCategory,
  FinanceExpenseAttachment,
  FinanceCategoryPayload,
  FinanceExpense,
  FinanceExpensePayload,
  FinanceExpensesFilters,
  FinanceExpensesSummary
} from "@/entities/finance/model/types";

export function listFinanceCategoriesRequest() {
  return apiRequest<FinanceCategory[]>("/finance/categories");
}

export function createFinanceCategoryRequest(payload: FinanceCategoryPayload) {
  return apiRequest<FinanceCategory>("/finance/categories", {
    method: "POST",
    body: payload
  });
}

export function updateFinanceCategoryRequest(categoryId: number, payload: FinanceCategoryPayload) {
  return apiRequest<FinanceCategory>(`/finance/categories/${categoryId}`, {
    method: "PUT",
    body: payload
  });
}

export function deleteFinanceCategoryRequest(categoryId: number) {
  return apiRequest<void>(`/finance/categories/${categoryId}`, {
    method: "DELETE"
  });
}

export function listFinanceExpensesRequest(filters: FinanceExpensesFilters = {}) {
  const searchParams = new URLSearchParams();
  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }
  const query = searchParams.toString();
  return apiRequest<FinanceExpense[]>(query ? `/finance/expenses?${query}` : "/finance/expenses");
}

export type FinanceExpensesPageRequest = FinanceExpensesFilters & {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export function listFinanceExpensesPageRequest(filters: FinanceExpensesPageRequest) {
  const searchParams = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize)
  });
  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }
  if (filters.sortBy) {
    searchParams.set("sort_by", filters.sortBy);
  }
  if (filters.sortDir) {
    searchParams.set("sort_dir", filters.sortDir);
  }
  return apiRequest<PaginatedResponse<FinanceExpense>>(`/finance/expenses?${searchParams.toString()}`);
}

export function getFinanceExpenseRequest(expenseId: number) {
  return apiRequest<FinanceExpense>(`/finance/expenses/${expenseId}`);
}

export function getFinanceExpensesSummaryRequest(filters: FinanceExpensesFilters = {}) {
  const searchParams = new URLSearchParams();
  if (filters.dateFrom) {
    searchParams.set("date_from", filters.dateFrom);
  }
  if (filters.dateTo) {
    searchParams.set("date_to", filters.dateTo);
  }
  const query = searchParams.toString();
  return apiRequest<FinanceExpensesSummary>(query ? `/finance/expenses/summary?${query}` : "/finance/expenses/summary");
}

export function createFinanceExpenseRequest(payload: FinanceExpensePayload) {
  return apiRequest<FinanceExpense>("/finance/expenses", {
    method: "POST",
    body: payload
  });
}

export function updateFinanceExpenseRequest(expenseId: number, payload: FinanceExpensePayload) {
  return apiRequest<FinanceExpense>(`/finance/expenses/${expenseId}`, {
    method: "PUT",
    body: payload
  });
}

export function deleteFinanceExpenseRequest(expenseId: number) {
  return apiRequest<void>(`/finance/expenses/${expenseId}`, {
    method: "DELETE"
  });
}

export function listFinanceExpenseAttachmentsRequest(expenseId: number) {
  return apiRequest<FinanceExpenseAttachment[]>(`/finance/expenses/${expenseId}/attachments`);
}

export function uploadFinanceExpenseAttachmentRequest(expenseId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<FinanceExpenseAttachment>(`/finance/expenses/${expenseId}/attachments`, {
    method: "POST",
    body: formData
  });
}

export function deleteFinanceExpenseAttachmentRequest(expenseId: number, attachmentId: number) {
  return apiRequest<void>(`/finance/expenses/${expenseId}/attachments/${attachmentId}`, {
    method: "DELETE"
  });
}

export async function downloadFinanceExpenseAttachmentRequest(expenseId: number, attachmentId: number) {
  return apiDownload(`/finance/expenses/${expenseId}/attachments/${attachmentId}/file`);
}
