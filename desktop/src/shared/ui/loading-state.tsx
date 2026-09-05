import { LoaderCircle } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export function LoadingState({
  compact = false,
  description,
  title
}: {
  compact?: boolean;
  description: string;
  title: string;
}) {
  return (
    <div className={cn("glass-panel rounded-2xl p-8 text-center", compact && "p-6")}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-muted text-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 space-y-3">
        <div className="h-2 rounded-full bg-surface-2" />
        <div className="mx-auto h-2 w-4/5 rounded-full bg-surface-2" />
      </div>
    </div>
  );
}
