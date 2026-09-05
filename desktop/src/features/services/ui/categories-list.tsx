import type { ServiceCatalogItem, ServiceCategory } from "@/entities/service/model/types";
import { cn } from "@/shared/lib/cn";
import { formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { StatusBadge } from "@/shared/ui/status-badge";

export function CategoriesList({
  categories,
  onCreateCategory,
  onFilterCategory,
  onOpenCategory,
  selectedCategoryFilter,
  selectedCategoryId,
  services
}: {
  categories: ServiceCategory[];
  onCreateCategory?: () => void;
  onFilterCategory: (categoryId: number | null) => void;
  onOpenCategory: (categoryId: number) => void;
  selectedCategoryFilter: number | null;
  selectedCategoryId: number | null;
  services: ServiceCatalogItem[];
}) {
  const countByCategory = new Map<number, number>();
  services.forEach((service) => {
    countByCategory.set(service.category_id, (countByCategory.get(service.category_id) ?? 0) + 1);
  });

  return (
    <section className="glass-panel rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Категории услуг</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Плоский справочник категорий для каталога и заказов.
          </p>
        </div>
        {onCreateCategory ? (
          <AppButton size="sm" variant="outline" onClick={onCreateCategory}>
            Новая категория
          </AppButton>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <AppButton
          size="sm"
          variant={selectedCategoryFilter === null ? "default" : "outline"}
          onClick={() => onFilterCategory(null)}
        >
          Все категории
        </AppButton>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onOpenCategory(category.id)}
            className={cn(
              "rounded-2xl border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-accent-muted/40",
              selectedCategoryId === category.id && "border-accent/60",
              selectedCategoryFilter === category.id && "bg-accent-muted/70"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full border border-white/15"
                style={{ backgroundColor: category.color }}
              />
              <span className="font-medium">{category.name}</span>
              <StatusBadge
                label={category.is_active ? "Активно" : "Неактивно"}
                tone={category.is_active ? "success" : "muted"}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatNumber(countByCategory.get(category.id) ?? 0)} услуг
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
