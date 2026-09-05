import type { Material } from "@/entities/material/model/types";

export type MaterialCategorySummary = {
  amount: number;
  categoryId: number | null;
  name: string;
  rows: number;
};

export function summarizeMaterialsByCategory(expenses: Material[]) {
  const buckets = new Map<string, MaterialCategorySummary>();

  expenses.forEach((expense) => {
    const categoryId = expense.service_category_id;
    const key = categoryId === null ? "uncategorized" : String(categoryId);
    const current = buckets.get(key) ?? {
      amount: 0,
      categoryId,
      name: expense.service_category_name?.trim() || "Без категории",
      rows: 0
    };

    current.amount += Number(expense.row_total);
    current.rows += 1;
    buckets.set(key, current);
  });

  return Array.from(buckets.values()).sort((left, right) => {
    const amountDiff = right.amount - left.amount;
    if (amountDiff !== 0) {
      return amountDiff;
    }

    return left.name.localeCompare(right.name, "ru-RU");
  });
}
