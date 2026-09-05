import type { ServiceCatalogItem, ServiceCategory } from "@/entities/service/model/types";
import { cn } from "@/shared/lib/cn";
import { formatCurrency } from "@/shared/lib/format";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

export function ServicesList({
  categories,
  isMobile,
  onOpenService,
  selectedServiceId,
  services
}: {
  categories: ServiceCategory[];
  isMobile: boolean;
  onOpenService: (serviceId: number) => void;
  selectedServiceId: number | null;
  services: ServiceCatalogItem[];
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  if (!services.length) {
    return (
      <EmptyState
        title="Услуги не найдены"
        description="Измените фильтры или создайте новую услугу, чтобы наполнить каталог."
      />
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => onOpenService(service.id)}
            className={cn(
              "glass-panel w-full rounded-2xl p-4 text-left transition-colors hover:bg-surface-2/80",
              selectedServiceId === service.id && "border-accent/60"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">{service.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{categoryMap.get(service.category_id) ?? `Категория #${service.category_id}`}</div>
              </div>
              <StatusBadge label={service.is_active ? "Активно" : "Неактивно"} tone={service.is_active ? "success" : "muted"} />
            </div>
            <div className="mt-3 text-sm text-muted-foreground">Базовая цена: {formatCurrency(service.default_price)}</div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[1.2fr_220px_180px_140px] gap-4 border-b border-border bg-surface-2/70 px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Услуга</span>
        <span>Категория</span>
        <span>Цена</span>
        <span>Статус</span>
      </div>
      <div className="divide-y divide-border">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => onOpenService(service.id)}
            className={cn(
              "grid w-full grid-cols-[1.2fr_220px_180px_140px] gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2/50",
              selectedServiceId === service.id && "bg-accent-muted/60"
            )}
          >
            <div className="font-medium">{service.name}</div>
            <div className="text-sm text-muted-foreground">{categoryMap.get(service.category_id) ?? `Категория #${service.category_id}`}</div>
            <div className="text-sm text-muted-foreground">{formatCurrency(service.default_price)}</div>
            <div className="flex items-start">
              <StatusBadge label={service.is_active ? "Активно" : "Неактивно"} tone={service.is_active ? "success" : "muted"} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
