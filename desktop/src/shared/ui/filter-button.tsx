import { SlidersHorizontal } from "lucide-react";

import { AppButton, type AppButtonProps } from "@/shared/ui/app-button";

export function FilterButton(props: AppButtonProps) {
  return (
    <AppButton variant="outline" {...props}>
      <SlidersHorizontal className="h-4 w-4" />
      Фильтр
    </AppButton>
  );
}
