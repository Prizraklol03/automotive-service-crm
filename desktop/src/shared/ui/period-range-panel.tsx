import { type ChangeEventHandler } from "react";

import { formatDate } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { MobileFriendlyDateInput } from "@/shared/ui/mobile-friendly-date-input";

export function PeriodRangePanel({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onReset
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: ChangeEventHandler<HTMLInputElement>;
  onDateToChange: ChangeEventHandler<HTMLInputElement>;
  onReset: () => void;
}) {
  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-foreground">С даты</span>
          <MobileFriendlyDateInput value={dateFrom} onChange={onDateFromChange} />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-foreground">По дату включительно</span>
          <MobileFriendlyDateInput value={dateTo} onChange={onDateToChange} />
        </label>
        <AppButton type="button" variant="outline" onClick={onReset}>
          Сбросить
        </AppButton>
        <div className="rounded-2xl border border-border/80 bg-surface/65 px-4 py-3 text-sm text-muted-foreground">
          Период: {formatDate(dateFrom)} - {formatDate(dateTo)}
        </div>
      </div>
    </section>
  );
}
