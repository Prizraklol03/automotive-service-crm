import { Search } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { AppInput, type AppInputProps } from "@/shared/ui/app-input";

export function SearchInput({ className, ...props }: AppInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <AppInput type="search" className="pl-9" {...props} />
    </div>
  );
}
