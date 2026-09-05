import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteFinanceExpenseAttachmentRequest,
  createFinanceCategoryRequest,
  createFinanceExpenseRequest,
  downloadFinanceExpenseAttachmentRequest,
  deleteFinanceCategoryRequest,
  deleteFinanceExpenseRequest,
  getFinanceExpenseRequest,
  getFinanceExpensesSummaryRequest,
  listFinanceCategoriesRequest,
  listFinanceExpenseAttachmentsRequest,
  listFinanceExpensesRequest,
  listFinanceExpensesPageRequest,
  uploadFinanceExpenseAttachmentRequest,
  updateFinanceCategoryRequest,
  updateFinanceExpenseRequest
} from "@/entities/finance/api/finance-api";
import type {
  FinanceExpense,
  FinanceCategoryPayload,
  FinanceExpensePayload,
  FinanceExpensesFilters
} from "@/entities/finance/model/types";
import { useInfinitePagedQuery } from "@/shared/hooks/use-infinite-paged-query";
import type { PaginatedResponse } from "@/shared/model/pagination";

export function financeCategoriesQueryKey() {
  return ["finance", "categories"] as const;
}

export function financeExpensesQueryKey(filters: FinanceExpensesFilters = {}) {
  return ["finance", "expenses", filters.dateFrom ?? "", filters.dateTo ?? ""] as const;
}

export function financeExpenseDetailQueryKey(expenseId: number) {
  return ["finance", "expense", expenseId] as const;
}

export function financeExpenseAttachmentsQueryKey(expenseId: number) {
  return ["finance", "expense", expenseId, "attachments"] as const;
}

export function financeSummaryQueryKey(filters: FinanceExpensesFilters = {}) {
  return ["finance", "summary", filters.dateFrom ?? "", filters.dateTo ?? ""] as const;
}

export function useFinanceCategoriesQuery() {
  return useQuery({
    queryKey: financeCategoriesQueryKey(),
    queryFn: () => listFinanceCategoriesRequest()
  });
}

export function useCreateFinanceCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FinanceCategoryPayload) => createFinanceCategoryRequest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
    }
  });
}

export function useUpdateFinanceCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, payload }: { categoryId: number; payload: FinanceCategoryPayload }) =>
      updateFinanceCategoryRequest(categoryId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
    }
  });
}

export function useDeleteFinanceCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) => deleteFinanceCategoryRequest(categoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
    }
  });
}

export function useFinanceExpensesQuery(filters: FinanceExpensesFilters = {}) {
  return useQuery({
    queryKey: financeExpensesQueryKey(filters),
    queryFn: () => listFinanceExpensesRequest(filters)
  });
}

export function financeExpensesPageQueryKey(
  filters: FinanceExpensesFilters & { page: number; pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }
) {
  return [
    "finance",
    "expenses",
    "page",
    filters.dateFrom ?? "",
    filters.dateTo ?? "",
    filters.page,
    filters.pageSize,
    filters.sortBy ?? "",
    filters.sortDir ?? ""
  ] as const;
}

export function useFinanceExpensesPageQuery(
  filters: FinanceExpensesFilters & { page: number; pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }
) {
  return useQuery({
    queryKey: financeExpensesPageQueryKey(filters),
    queryFn: () =>
      listFinanceExpensesPageRequest({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        page: filters.page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir
      }),
    placeholderData: keepPreviousData
  });
}

export function useFinanceExpensesInfiniteQuery(
  filters: FinanceExpensesFilters & { pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }
) {
  const normalizedFilters = {
    ...filters,
    dateFrom: filters.dateFrom?.trim() || undefined,
    dateTo: filters.dateTo?.trim() || undefined
  };

  return useInfinitePagedQuery<FinanceExpense, PaginatedResponse<FinanceExpense>>({
    queryKey: [
      "finance",
      "expenses",
      "infinite",
      normalizedFilters.dateFrom ?? "",
      normalizedFilters.dateTo ?? "",
      normalizedFilters.pageSize,
      normalizedFilters.sortBy ?? "",
      normalizedFilters.sortDir ?? ""
    ] as const,
    queryFn: (page) =>
      listFinanceExpensesPageRequest({
        ...normalizedFilters,
        page,
        pageSize: normalizedFilters.pageSize
      })
  });
}

export function useFinanceExpenseDetailQuery(expenseId: number | null) {
  return useQuery({
    queryKey: expenseId ? financeExpenseDetailQueryKey(expenseId) : ["finance", "expense", "empty"],
    queryFn: () => getFinanceExpenseRequest(expenseId as number),
    enabled: expenseId !== null
  });
}

export function useFinanceExpenseAttachmentsQuery(expenseId: number | null) {
  return useQuery({
    queryKey: expenseId ? financeExpenseAttachmentsQueryKey(expenseId) : ["finance", "expense", "empty", "attachments"],
    queryFn: () => listFinanceExpenseAttachmentsRequest(expenseId as number),
    enabled: expenseId !== null,
    staleTime: 30_000
  });
}

export function useFinanceSummaryQuery(filters: FinanceExpensesFilters = {}) {
  return useQuery({
    queryKey: financeSummaryQueryKey(filters),
    queryFn: () => getFinanceExpensesSummaryRequest(filters),
    placeholderData: keepPreviousData
  });
}

export function useCreateFinanceExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FinanceExpensePayload) => createFinanceExpenseRequest(payload),
    onSuccess: (expense) => {
      queryClient.setQueryData(financeExpenseDetailQueryKey(expense.id), expense);
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });
}

export function useUpdateFinanceExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, payload }: { expenseId: number; payload: FinanceExpensePayload }) =>
      updateFinanceExpenseRequest(expenseId, payload),
    onSuccess: (expense) => {
      queryClient.setQueryData(financeExpenseDetailQueryKey(expense.id), expense);
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });
}

export function useDeleteFinanceExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: number) => deleteFinanceExpenseRequest(expenseId),
    onSuccess: (_, expenseId) => {
      queryClient.removeQueries({ queryKey: financeExpenseDetailQueryKey(expenseId) });
      void queryClient.invalidateQueries({ queryKey: ["finance"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });
}

export function useUploadFinanceExpenseAttachmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: number; file: File }) => uploadFinanceExpenseAttachmentRequest(expenseId, file),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: financeExpenseAttachmentsQueryKey(variables.expenseId) });
    }
  });
}

export function useDeleteFinanceExpenseAttachmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, attachmentId }: { expenseId: number; attachmentId: number }) =>
      deleteFinanceExpenseAttachmentRequest(expenseId, attachmentId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: financeExpenseAttachmentsQueryKey(variables.expenseId) });
    }
  });
}

export async function downloadFinanceExpenseAttachment(expenseId: number, attachmentId: number) {
  return downloadFinanceExpenseAttachmentRequest(expenseId, attachmentId);
}
