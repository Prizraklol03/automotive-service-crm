import * as React from "react";

import { cn } from "@/shared/lib/cn";

export type AppTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
const FIELD_BACKGROUND_CLASS = "bg-[var(--field-background)]";

export const AppTextarea = React.forwardRef<HTMLTextAreaElement, AppTextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[112px] w-full rounded-xl border border-input px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
        FIELD_BACKGROUND_CLASS,
        className
      )}
      {...props}
    />
  );
});

AppTextarea.displayName = "AppTextarea";
