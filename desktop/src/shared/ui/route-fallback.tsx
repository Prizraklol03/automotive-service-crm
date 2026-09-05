import { BRAND_NAME } from "@/shared/config/brand";
import { LoadingState } from "@/shared/ui/loading-state";

export function RouteFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <LoadingState compact title="Загружаем экран" description={`Подготавливаем модуль ${BRAND_NAME} и восстанавливаем рабочий контекст.`} />
      </div>
    </div>
  );
}
