import { useState, type ReactNode } from "react";
import {
  BadgeRussianRuble,
  CalendarDays,
  CarFront,
  Clock3,
  Hash,
  Tag,
  UserRound,
  X
} from "lucide-react";

import type { OrderFilters } from "@/entities/order/api/order-api";
import {
  DEFAULT_ORDER_SORTS,
  QUICK_ORDER_SORTS,
  type OrderSortDescriptor,
  type OrderSortKey
} from "@/features/orders/model/order-sorting";
import { OrderSortEditor } from "@/features/orders/ui/order-sort-editor";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";
import { AppCheckbox } from "@/shared/ui/app-checkbox";
import { AppInput } from "@/shared/ui/app-input";
import { MobileSheet } from "@/shared/ui/mobile-sheet";

const QUICK_ICONS: Record<OrderSortKey, typeof Clock3> = {
  amount_to_pay: BadgeRussianRuble,
  client_full_name: UserRound,
  id: Hash,
  scheduled_for: CalendarDays,
  status: Tag,
  updated_at: Clock3,
  vehicle_brand: CarFront,
  vehicle_model: CarFront,
  vehicle_plate_number: Hash
};

export function countActiveOrderFilters(filters: OrderFilters) {
  return [
    filters.scheduledFrom || filters.scheduledTo,
    filters.updatedFrom || filters.updatedTo,
    filters.paymentStatus?.length,
    filters.hasComment,
    filters.hasDocuments,
    filters.client?.trim(),
    filters.brand?.trim(),
    filters.model?.trim(),
    filters.plate?.trim()
  ].filter(Boolean).length;
}

export function OrdersFilterSortPanel({
  filters,
  isSavingDefault,
  onApply,
  onClose,
  onSaveDefault,
  saveDefaultError,
  sortDescriptors
}: {
  filters: OrderFilters;
  isSavingDefault: boolean;
  onApply: (filters: OrderFilters, descriptors: OrderSortDescriptor[]) => void;
  onClose: () => void;
  onSaveDefault: (descriptors: OrderSortDescriptor[]) => void;
  saveDefaultError?: string | null;
  sortDescriptors: OrderSortDescriptor[];
}) {
  const [draftFilters, setDraftFilters] = useState<OrderFilters>(filters);
  const [draftSorts, setDraftSorts] = useState<OrderSortDescriptor[]>(sortDescriptors);
  const activeFilterCount = countActiveOrderFilters(draftFilters);

  const updateFilter = <Key extends keyof OrderFilters>(key: Key, value: OrderFilters[Key]) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  const togglePaymentStatus = (status: "unpaid" | "partial" | "paid", checked: boolean) => {
    const current = draftFilters.paymentStatus ?? [];
    updateFilter("paymentStatus", checked ? [...current, status] : current.filter((item) => item !== status));
  };

  const resetAll = () => {
    setDraftFilters({});
    setDraftSorts([...DEFAULT_ORDER_SORTS]);
  };

  return (
    <MobileSheet className="ml-auto w-full max-w-[720px] border-l border-border/80 shadow-panel" onClose={onClose}>
      <div className="flex h-full min-h-0 flex-col" role="dialog" aria-modal="true" aria-labelledby="orders-filter-sort-title">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
          <h2 id="orders-filter-sort-title" className="text-base font-semibold text-foreground">Фильтры и сортировка</h2>
          <div className="flex items-center gap-1">
            <AppButton size="sm" variant="ghost" onClick={resetAll}>Сбросить всё</AppButton>
            <AppButton size="icon" variant="ghost" aria-label="Закрыть фильтры и сортировку" onClick={onClose}>
              <X className="h-5 w-5" />
            </AppButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <section aria-labelledby="quick-sort-heading">
            <h3 id="quick-sort-heading" className="text-sm font-semibold text-foreground">Быстрые сортировки</h3>
            <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
              {QUICK_ORDER_SORTS.map((preset) => {
                const Icon = QUICK_ICONS[preset.key];
                const active = draftSorts.length === 1 && draftSorts[0]?.key === preset.key && draftSorts[0]?.direction === preset.direction;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={cn(
                      "flex min-h-20 w-[108px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-md border px-2 py-3 text-center text-xs transition-colors",
                      active ? "border-accent/70 bg-accent-muted text-foreground" : "border-border/70 bg-background/30 text-muted-foreground hover:bg-surface-2"
                    )}
                    onClick={() => setDraftSorts([{ key: preset.key, direction: preset.direction }])}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="leading-tight">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-5 border-t border-border pt-5" aria-labelledby="extra-filter-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="extra-filter-heading" className="text-sm font-semibold text-foreground">Дополнительные фильтры</h3>
              {activeFilterCount ? <span className="text-xs text-muted-foreground">Активно: {activeFilterCount}</span> : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DateRange label="Дата записи" from={draftFilters.scheduledFrom} to={draftFilters.scheduledTo} onFromChange={(value) => updateFilter("scheduledFrom", value)} onToChange={(value) => updateFilter("scheduledTo", value)} />
              <DateRange label="Дата обновления" from={draftFilters.updatedFrom} to={draftFilters.updatedTo} onFromChange={(value) => updateFilter("updatedFrom", value)} onToChange={(value) => updateFilter("updatedTo", value)} />
            </div>

            <fieldset className="mt-4">
              <legend className="text-xs font-medium text-muted-foreground">Статус оплаты</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <AppCheckbox aria-label="Оплачено" checked={draftFilters.paymentStatus?.includes("paid") ?? false} onChange={(event) => togglePaymentStatus("paid", event.target.checked)} />
                <AppCheckbox aria-label="Не оплачено" checked={draftFilters.paymentStatus?.includes("unpaid") ?? false} onChange={(event) => togglePaymentStatus("unpaid", event.target.checked)} />
                <AppCheckbox aria-label="Частично" checked={draftFilters.paymentStatus?.includes("partial") ?? false} onChange={(event) => togglePaymentStatus("partial", event.target.checked)} />
              </div>
            </fieldset>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <AppCheckbox aria-label="Есть комментарий" checked={draftFilters.hasComment ?? false} onChange={(event) => updateFilter("hasComment", event.target.checked || undefined)} />
              <AppCheckbox aria-label="Есть документы" checked={draftFilters.hasDocuments ?? false} onChange={(event) => updateFilter("hasDocuments", event.target.checked || undefined)} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Клиент"><AppInput value={draftFilters.client ?? ""} placeholder="ФИО или телефон" onChange={(event) => updateFilter("client", event.target.value)} /></Field>
              <Field label="Госномер"><AppInput value={draftFilters.plate ?? ""} placeholder="Например, А123АА 00" onChange={(event) => updateFilter("plate", event.target.value)} /></Field>
              <Field label="Марка"><AppInput value={draftFilters.brand ?? ""} placeholder="Введите марку" onChange={(event) => updateFilter("brand", event.target.value)} /></Field>
              <Field label="Модель"><AppInput value={draftFilters.model ?? ""} placeholder="Введите модель" onChange={(event) => updateFilter("model", event.target.value)} /></Field>
            </div>
          </section>

          <section className="mt-5 border-t border-border pt-5" aria-labelledby="default-sort-heading">
            <div>
              <h3 id="default-sort-heading" className="text-sm font-semibold text-foreground">Сортировка по умолчанию</h3>
              <p className="mt-1 text-xs text-muted-foreground">Порядок строк определяет приоритет сортировки для текущего пользователя.</p>
            </div>
            <div className="mt-3">
              <OrderSortEditor descriptors={draftSorts} disabled={isSavingDefault} onChange={setDraftSorts} />
            </div>
            {saveDefaultError ? <p className="mt-2 text-xs text-danger">{saveDefaultError}</p> : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-between">
              <AppButton
                variant="outline"
                disabled={isSavingDefault}
                onClick={() => {
                  setDraftSorts([...DEFAULT_ORDER_SORTS]);
                  onSaveDefault([...DEFAULT_ORDER_SORTS]);
                }}
              >
                Сбросить к системной
              </AppButton>
              <AppButton variant="outline" disabled={isSavingDefault || draftSorts.length === 0} onClick={() => onSaveDefault(draftSorts)}>
                {isSavingDefault ? "Сохраняем..." : "Сохранить по умолчанию"}
              </AppButton>
            </div>
          </section>
        </div>

        <footer className="border-t border-border bg-background/95 px-4 py-3 sm:px-5">
          <AppButton className="w-full" onClick={() => onApply(draftFilters, draftSorts)}>
            Применить{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </AppButton>
        </footer>
      </div>
    </MobileSheet>
  );
}

function DateRange({
  from,
  label,
  onFromChange,
  onToChange,
  to
}: {
  from?: string;
  label: string;
  onFromChange: (value: string | undefined) => void;
  onToChange: (value: string | undefined) => void;
  to?: string;
}) {
  return (
    <fieldset className="rounded-md border border-border/70 p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <AppInput aria-label={`${label}: от`} type="date" value={from ?? ""} onChange={(event) => onFromChange(event.target.value || undefined)} />
        <AppInput aria-label={`${label}: до`} type="date" value={to ?? ""} onChange={(event) => onToChange(event.target.value || undefined)} />
      </div>
    </fieldset>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="space-y-1.5 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}</label>;
}
