import type { PropsWithChildren } from "react";

import { cn } from "@/shared/lib/cn";

export function PageContainer({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 sm:py-6", className)} style={{ gap: "var(--page-gap, 1.5rem)" }}>
      {children}
    </div>
  );
}
