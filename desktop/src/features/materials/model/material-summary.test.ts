import { summarizeMaterialsByCategory } from "@/features/materials/model/material-summary";

describe("material category summary", () => {
  it("groups material totals by category and keeps uncategorized expenses", () => {
    const summaries = summarizeMaterialsByCategory([
      {
        expense_date: "2026-04-10",
        id: 1,
        material_name: "Polish",
        quantity: 1,
        row_total: "500.00",
        service_category_id: 10,
        service_category_name: "Detailing",
        unit_price: "500.00"
      },
      {
        expense_date: "2026-04-10",
        id: 2,
        material_name: "Tape",
        quantity: 2,
        row_total: "200.00",
        service_category_id: null,
        service_category_name: null,
        unit_price: "100.00"
      },
      {
        expense_date: "2026-04-10",
        id: 3,
        material_name: "Wax",
        quantity: 1,
        row_total: "700.00",
        service_category_id: 10,
        service_category_name: "Detailing",
        unit_price: "700.00"
      }
    ]);

    expect(summaries).toEqual([
      { amount: 1200, categoryId: 10, name: "Detailing", rows: 2 },
      { amount: 200, categoryId: null, name: "Без категории", rows: 1 }
    ]);
  });
});
