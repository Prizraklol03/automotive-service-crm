import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/cn";

type AppSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "role" | "aria-checked" | "onChange" | "onClick"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function AppSwitch({ checked, onChange, className, ...buttonProps }: AppSwitchProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-transparent bg-accent" : "border-border bg-surface-2",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-border/50 transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
