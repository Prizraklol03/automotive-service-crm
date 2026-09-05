import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

import { BRAND_NAME } from "@/shared/config/brand";
import { AppButton } from "@/shared/ui/app-button";
import { EmptyState } from "@/shared/ui/empty-state";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <EmptyState
          title="Страница не найдена"
          description="Маршрут не существует или был перенесён. Вернитесь в рабочее пространство CRM."
          icon={<Compass className="h-5 w-5" />}
          action={
            <AppButton asChild>
              <Link to="/">{`Открыть ${BRAND_NAME}`}</Link>
            </AppButton>
          }
        />
      </div>
    </div>
  );
}
