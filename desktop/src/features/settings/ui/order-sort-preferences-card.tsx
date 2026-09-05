import { useEffect, useState } from "react";

import {
  DEFAULT_ORDER_SORTS,
  normalizeOrderSortDescriptors,
  type OrderSortDescriptor
} from "@/features/orders/model/order-sorting";
import { OrderSortEditor } from "@/features/orders/ui/order-sort-editor";
import { useUpdateUserPreferencesMutation, useUserPreferencesQuery } from "@/features/settings/api/settings-hooks";
import { AppButton } from "@/shared/ui/app-button";

export function OrderSortPreferencesCard() {
  const preferencesQuery = useUserPreferencesQuery();
  const updatePreferencesMutation = useUpdateUserPreferencesMutation();
  const [draftSorts, setDraftSorts] = useState<OrderSortDescriptor[]>(DEFAULT_ORDER_SORTS);

  useEffect(() => {
    if (preferencesQuery.data?.order_sorting) {
      setDraftSorts(normalizeOrderSortDescriptors(preferencesQuery.data.order_sorting));
    }
  }, [preferencesQuery.data]);

  const saveSorting = (nextSorts: OrderSortDescriptor[]) => {
    if (!nextSorts.length) {
      return;
    }
    setDraftSorts(nextSorts);
    updatePreferencesMutation.mutate({ order_sorting: nextSorts });
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Сортировка заказов по умолчанию</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Порядок строк определяет приоритет. Настройка сохраняется только для текущего пользователя.</p>
        </div>
        <AppButton size="sm" variant="outline" disabled={updatePreferencesMutation.isPending} onClick={() => saveSorting([...DEFAULT_ORDER_SORTS])}>
          Сбросить к системной
        </AppButton>
      </div>

      <div className="mt-4">
        <OrderSortEditor descriptors={draftSorts} disabled={updatePreferencesMutation.isPending} minimumOne onChange={saveSorting} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {preferencesQuery.isLoading
          ? "Загружаем настройки..."
          : updatePreferencesMutation.isPending
            ? "Сохраняем..."
            : updatePreferencesMutation.isError
              ? "Не удалось сохранить настройку."
              : "Сохранено для текущего пользователя."}
      </p>
    </div>
  );
}
