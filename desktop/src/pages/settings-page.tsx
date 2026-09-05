import { useAuthStore } from "@/features/auth/model/auth-store";
import { useModulesQuery, useUpdateModulesMutation } from "@/features/settings/api/settings-hooks";
import { MODULE_DEFINITIONS } from "@/features/settings/model/module-definitions";
import { CustomFieldsCard } from "@/features/settings/ui/custom-fields-card";
import { DocumentTemplatesCard } from "@/features/settings/ui/document-templates-card";
import { OrderSortPreferencesCard } from "@/features/settings/ui/order-sort-preferences-card";
import { StatusTableCard } from "@/features/settings/ui/status-table-card";
import { VisualSettingsCard } from "@/features/settings/ui/visual-settings-card";
import type { ModuleKey } from "@/entities/settings/model/types";
import { useClientsViewMode } from "@/shared/hooks/use-clients-view-mode";
import { useColorPalette } from "@/shared/hooks/use-color-palette";
import { useOrderDetailVersion } from "@/shared/hooks/use-order-detail-version";
import { useOrdersViewMode } from "@/shared/hooks/use-orders-view-mode";
import { useVehiclesViewMode } from "@/shared/hooks/use-vehicles-view-mode";
import { AppButton } from "@/shared/ui/app-button";
import { AppSwitch } from "@/shared/ui/app-switch";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";

export function SettingsPage() {
  const { enabled, setEnabled } = useColorPalette();
  const { version: orderDetailVersion, setVersion: setOrderDetailVersion } = useOrderDetailVersion();
  const { mode, setMode } = useOrdersViewMode();
  const { mode: clientsMode, setMode: setClientsMode } = useClientsViewMode();
  const { mode: vehiclesMode, setMode: setVehiclesMode } = useVehiclesViewMode();
  const user = useAuthStore((state) => state.user);

  const modulesQuery = useModulesQuery();
  const updateModulesMutation = useUpdateModulesMutation();

  const isAdmin = user?.role_code === "admin";

  function handleModuleToggle(key: ModuleKey, value: boolean) {
    if (!modulesQuery.data) {
      return;
    }
    updateModulesMutation.mutate({ ...modulesQuery.data, [key]: value });
  }

  return (
    <PageContainer>
      <PageHeader title="Настройки" description="Глобальные настройки CRM и персональные параметры текущего пользователя." />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Персональные настройки</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Влияют только на ваш интерфейс, предпочтения отображения и поведение списков.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <label htmlFor="color-palette-switch" className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Цветовая палитра категорий</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Отображает цвета категорий услуг на карточках заказов и в календаре.
              </p>
            </div>
            <AppSwitch id="color-palette-switch" checked={enabled} onChange={setEnabled} />
          </label>
        </div>

        <OrderSortPreferencesCard />

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Отображение заказов</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Выберите, как показывать заказы в рабочем списке: компактными карточками или табличными строками.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppButton variant={mode === "rows" ? "default" : "outline"} size="sm" onClick={() => setMode("rows")}>
                Списком
              </AppButton>
              <AppButton variant={mode === "cards" ? "default" : "outline"} size="sm" onClick={() => setMode("cards")}>
                Карточками
              </AppButton>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Отображение клиентов</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Выберите, как показывать клиентов в рабочем списке: компактными карточками или табличными строками.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppButton variant={clientsMode === "rows" ? "default" : "outline"} size="sm" onClick={() => setClientsMode("rows")}>
                Списком
              </AppButton>
              <AppButton variant={clientsMode === "cards" ? "default" : "outline"} size="sm" onClick={() => setClientsMode("cards")}>
                Карточками
              </AppButton>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Отображение автомобилей</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Выберите, как показывать автомобили в рабочем списке: компактными карточками или табличными строками.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppButton variant={vehiclesMode === "rows" ? "default" : "outline"} size="sm" onClick={() => setVehiclesMode("rows")}>
                Списком
              </AppButton>
              <AppButton variant={vehiclesMode === "cards" ? "default" : "outline"} size="sm" onClick={() => setVehiclesMode("cards")}>
                Карточками
              </AppButton>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Карточка заказа</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Новая версия открывает карточку заказа в широком правом sideboard. Старая версия использует прежнее модальное окно.
              </p>
            </div>
            <label htmlFor="legacy-order-detail-switch" className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Старая версия</span>
              <AppSwitch
                id="legacy-order-detail-switch"
                checked={orderDetailVersion === "legacy"}
                onChange={(checked) => setOrderDetailVersion(checked ? "legacy" : "modern")}
              />
            </label>
          </div>
        </div>
      </section>

      {isAdmin ? (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Глобальные настройки CRM</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Влияют на всех пользователей, общую логику системы и состав возможностей CRM.
            </p>
          </div>

          <StatusTableCard />
          <VisualSettingsCard />
          <DocumentTemplatesCard />
          <CustomFieldsCard />

          {modulesQuery.data ? (
            <div className="glass-panel rounded-2xl p-4 sm:p-5">
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground">Модули системы</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Включайте только те модули, которые нужны вашему бизнесу. Выключенные модули не отображаются в интерфейсе.
                </p>
              </div>
              <div className="flex flex-col divide-y divide-border/60">
                {MODULE_DEFINITIONS.map((def) => (
                  <label
                    key={def.key}
                    htmlFor={`module-switch-${def.key}`}
                    className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{def.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
                    </div>
                    <AppSwitch
                      id={`module-switch-${def.key}`}
                      checked={modulesQuery.data[def.key]}
                      onChange={(value) => handleModuleToggle(def.key, value)}
                      disabled={updateModulesMutation.isPending}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </PageContainer>
  );
}
