import type { PropsWithChildren, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export function SectionCard({
  action,
  children,
  className,
  description,
  title
}: PropsWithChildren<{
  action?: ReactNode;
  className?: string;
  description?: string;
  title: string;
}>) {
  return (
    <section className={cn("glass-panel rounded-2xl p-5 sm:p-6", className)}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
