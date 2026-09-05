import type { ChangeEventHandler } from "react";

import { AppInput } from "@/shared/ui/app-input";

export function MobileFriendlyDateInput({
  value,
  onChange
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return <AppInput type="date" value={value} onChange={onChange} />;
}
