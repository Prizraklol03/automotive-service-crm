import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export type AppSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const AppSelect = React.forwardRef<HTMLSelectElement, AppSelectProps>(({ children, className, ...props }, ref) => {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-11 w-full cursor-pointer appearance-none rounded-xl border border-input bg-surface px-3 py-2 pr-10 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
});

AppSelect.displayName = "AppSelect";
