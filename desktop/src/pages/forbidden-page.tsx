import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import { AppButton } from "@/shared/ui/app-button";
import { EmptyState } from "@/shared/ui/empty-state";

export function ForbiddenPage() {
  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <EmptyState
          title="Раздел недоступен"
          description="У вашей роли нет доступа к этому разделу. Приложение уже скрывает недоступные пункты, но прямой переход сюда заблокирован."
          icon={<ShieldAlert className="h-5 w-5" />}
          action={
            <AppButton asChild>
              <Link to="/">Вернуться на главную</Link>
            </AppButton>
          }
        />
      </div>
    </div>
  );
}
