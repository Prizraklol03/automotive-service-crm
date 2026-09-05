import * as React from "react";

import { cn } from "@/shared/lib/cn";

export type AppCheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

export const AppCheckbox = React.forwardRef<HTMLInputElement, AppCheckboxProps>(({ className, ...props }, ref) => {
  return (
    <label className={cn("flex items-center gap-3 text-sm text-foreground", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="h-4 w-4 rounded border border-input bg-surface text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...props}
      />
      <span>{props["aria-label"]}</span>
    </label>
  );
});

AppCheckbox.displayName = "AppCheckbox";
