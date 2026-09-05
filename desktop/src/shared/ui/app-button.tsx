import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/cn";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "default",
      variant: "default"
    },
    variants: {
      size: {
        default: "h-11 px-4 py-2",
        icon: "h-11 w-11",
        lg: "h-12 px-5 text-sm",
        sm: "h-9 px-3 text-sm"
      },
      variant: {
        default: "bg-accent text-accent-foreground shadow-soft hover:bg-accent-hover",
        ghost: "bg-transparent text-foreground hover:bg-surface-2",
        outline: "border border-border bg-surface text-foreground hover:bg-surface-2",
        subtle: "bg-accent-muted text-foreground hover:bg-accent-muted/80"
      }
    }
  }
);

export interface AppButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ className, size, variant }))} ref={ref} {...props} />;
  }
);

AppButton.displayName = "AppButton";
