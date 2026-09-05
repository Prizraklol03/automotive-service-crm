import type { ReactNode } from "react";

export function StatCard({
  hint,
  label,
  trend,
  value
}: {
  hint?: string;
  label: string;
  trend?: ReactNode;
  value: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {trend !== undefined ? <div className="rounded-xl bg-accent-muted p-2 text-foreground">{trend}</div> : null}
      </div>
    </div>
  );
}
