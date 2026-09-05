import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export function EmptyState({
  action,
  className,
  description,
  icon,
  title
}: {
  action?: ReactNode;
  className?: string;
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div className={cn("glass-panel rounded-2xl p-8 text-center", className)}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-muted text-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
