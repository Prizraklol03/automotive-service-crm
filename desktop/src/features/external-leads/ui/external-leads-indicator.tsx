import { NavLink } from "react-router-dom";
import { Radio } from "lucide-react";

import { useExternalLeadSummaryQuery } from "@/features/external-leads/api/external-leads-hooks";
import { cn } from "@/shared/lib/cn";

export function ExternalLeadsIndicator() {
  const summaryQuery = useExternalLeadSummaryQuery();
  const newCount = summaryQuery.data?.newCount ?? 0;
  const hasNew = newCount > 0;
  const labelValue = summaryQuery.isLoading || summaryQuery.isError ? "—" : String(newCount);

  return (
    <NavLink
      to="/integrations/external-leads?status=new"
      className={({ isActive }) =>
        cn(
          "group inline-flex min-h-10 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all",
          hasNew
            ? "border-warning/50 bg-warning/12 text-foreground shadow-[0_0_0_1px_rgba(245,158,11,0.08)]"
            : "border-border bg-surface text-muted-foreground",
          isActive && "border-accent/40 bg-accent-muted text-foreground",
          hasNew && "hover:bg-warning/18"
        )
      }
      aria-label={`Новые заявки: ${labelValue}`}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
          hasNew ? "border-warning/40 bg-warning/15 text-warning" : "border-border/70 bg-background text-muted-foreground"
        )}
      >
        <Radio className={cn("h-3.5 w-3.5", hasNew && "animate-pulse")} />
      </span>
      <span className="hidden lg:inline">Новые заявки: {labelValue}</span>
      <span className="lg:hidden">Заявки {labelValue}</span>
    </NavLink>
  );
}
