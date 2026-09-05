import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Archive, ArrowLeft, KeyRound, RotateCcw, ShieldUser, X } from "lucide-react";

import {
  useCreateUserMutation,
  useUserActivityQuery,
  useUserDetailQuery,
  useUserPermissionsQuery,
  useResetUserPasswordMutation,
  useSetUserActiveMutation,
  useUpdateUserMutation,
  useUpdateUserPermissionsMutation
} from "@/features/users/api/users-hooks";
import {
  userFormSchema,
  mapUserToFormValues,
  mapFormValuesToUserPayload,
  mapFormValuesToUserUpdatePayload,
  type UserFormValues
} from "@/features/users/model/user-form";
import { AppSwitch } from "@/shared/ui/app-switch";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

type UserViewMode = "details" | "activity";

const panelBaseClassName = "z-50 flex flex-col overflow-hidden bg-background shadow-panel";
const centeredDesktopClassName =
  "fixed left-1/2 top-1/2 hidden max-h-[min(880px,calc(100svh-2rem))] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex";

const emptyValues: UserFormValues = {
  full_name: "",
  login: "",
  password: ""
};

const PERMISSION_GROUPS = [
  {
    title: "Персональные данные",
    items: [
      { code: "personal_data.view", label: "Просмотр персональных данных" },
      { code: "personal_data.edit", label: "Редактирование персональных данных" },
      { code: "personal_data.export", label: "Экспорт персональных данных" }
    ]
  },
  {
    title: "Документы",
    items: [
      { code: "documents.view", label: "Просмотр документов" },
      { code: "documents.download", label: "Скачивание документов" },
      { code: "documents.generate", label: "Создание документов" }
    ]
  },
  {
    title: "Фотографии",
    items: [
      { code: "photos.view", label: "Просмотр фотографий" },
      { code: "photos.upload", label: "Загрузка фотографий" }
    ]
  },
  {
    title: "Аудит",
    items: [{ code: "audit_logs.view", label: "Просмотр журнала аудита" }]
  },
  {
    title: "Платежи",
    items: [
      { code: "orders.payments.create", label: "Создание платежей" },
      { code: "orders.payments.edit", label: "Редактирование платежей" },
      { code: "orders.payments.delete", label: "Удаление платежей" }
    ]
  },
  {
    title: "Клиенты",
    items: [
      { code: "clients.view", label: "Просмотр клиентов" },
      { code: "clients.create", label: "Создание клиентов" },
      { code: "clients.edit", label: "Редактирование клиентов" }
    ]
  },
  {
    title: "Автомобили",
    items: [
      { code: "vehicles.view", label: "Просмотр автомобилей" },
      { code: "vehicles.create", label: "Создание автомобилей" },
      { code: "vehicles.edit", label: "Редактирование автомобилей" }
    ]
  },
  {
    title: "Заказы",
    items: [
      { code: "orders.view", label: "Просмотр заказов" },
      { code: "orders.create", label: "Создание заказов" },
      { code: "orders.edit", label: "Редактирование заказов" },
      { code: "orders.change_prices", label: "Изменение цен" },
      { code: "orders.complete", label: "Завершение заказов" },
      { code: "orders.documents", label: "Работа с документами" }
    ]
  },
  {
    title: "Расходники",
    items: [
      { code: "materials.view", label: "Просмотр расходников" },
      { code: "materials.manage", label: "Управление расходниками" }
    ]
  },
  {
    title: "Финансы",
    items: [
      { code: "finance.view", label: "Просмотр финансов" },
      { code: "finance.expenses.create", label: "Добавление расходов" },
      { code: "finance.expenses.edit_delete", label: "Редактирование/удаление расходов" }
    ]
  },
  {
    title: "Аналитика",
    items: [{ code: "analytics.view", label: "Просмотр аналитики" }]
  },
  {
    title: "Настройки",
    items: [
      { code: "settings.users.manage", label: "Управление пользователями" },
      { code: "settings.catalog.manage", label: "Управление каталогом услуг" }
    ]
  }
] as const;

export function UserDetailPanel({
  userKey,
  isMobile,
  onClose,
  onCreated
}: {
  userKey: string | null;
  isMobile: boolean;
  onClose: () => void;
  onCreated: (userId: number) => void;
}) {
  useOverlayMode(Boolean(userKey), onClose);

  const [viewMode, setViewMode] = useState<UserViewMode>("details");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isCreateMode = userKey === "new";
  const userId = !userKey || userKey === "new" ? null : Number(userKey);

  const userQuery = useUserDetailQuery(userId);
  const userActivityQuery = useUserActivityQuery(viewMode === "activity" ? userId : null);
  const userPermissionsQuery = useUserPermissionsQuery(!isCreateMode && userId !== null ? userId : null);
  const createUserMutation = useCreateUserMutation();
  const updateUserMutation = useUpdateUserMutation();
  const updateUserPermissionsMutation = useUpdateUserPermissionsMutation();
  const resetPasswordMutation = useResetUserPasswordMutation();
  const setUserActiveMutation = useSetUserActiveMutation();
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: emptyValues
  });

  useEffect(() => {
    setViewMode("details");
    setSaveMessage(null);
    setSaveError(null);
  }, [userKey]);

  useEffect(() => {
    if (userQuery.data) {
      form.reset(mapUserToFormValues(userQuery.data));
      return;
    }

    if (isCreateMode) {
      form.reset(emptyValues);
    }
  }, [userQuery.data, form, isCreateMode]);

  useEffect(() => {
    if (!userPermissionsQuery.data) {
      setPermissionDraft({});
      return;
    }

    const nextDraft: Record<string, boolean> = {};
    userPermissionsQuery.data.permissions.forEach((permission) => {
      nextDraft[permission.permission_code] = permission.is_allowed;
    });
    setPermissionDraft(nextDraft);
  }, [userPermissionsQuery.data]);

  const panelTitle = useMemo(() => {
    if (isCreateMode) {
      return "Новый пользователь";
    }
    if (viewMode === "activity") {
      return `Действия · ${userQuery.data?.full_name ?? `#${userId}`}`;
    }
    return userQuery.data?.full_name ?? `#${userId}`;
  }, [userId, userQuery.data?.full_name, isCreateMode, viewMode]);

  const isAdminUser = userQuery.data?.role_code === "admin";
  const userPermissions = userPermissionsQuery.data?.permissions ?? [];
  const hasPermissionChanges = userPermissions.some(
    (permission) => (permissionDraft[permission.permission_code] ?? permission.is_allowed) !== permission.is_allowed
  );

  const buildPermissionPayload = () =>
    userPermissions.map((permission) => ({
      permission_code: permission.permission_code,
      is_allowed: permissionDraft[permission.permission_code] ?? permission.is_allowed
    }));

  const handlePermissionChange = (permissionCode: string, isAllowed: boolean) => {
    setPermissionDraft((current) => ({ ...current, [permissionCode]: isAllowed }));
  };

  const handleActiveStateChange = async (isActive: boolean) => {
    if (!userId || !userQuery.data) return;
    if (!isActive && !window.confirm("Архивировать пользователя? Он немедленно потеряет доступ: все активные сеансы будут отозваны, а для входа после восстановления потребуется новая авторизация.")) return;
    try {
      setSaveError(null);
      setSaveMessage(null);
      await setUserActiveMutation.mutateAsync({ userId, isActive });
      setSaveMessage(isActive ? "Пользователь восстановлен. Для входа потребуется новая авторизация." : "Пользователь архивирован, доступ отозван.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось изменить статус пользователя");
    }
  };

  const handleSavePermissions = async () => {
    if (!userId || !userQuery.data || isAdminUser) {
      return null;
    }

    const response = await updateUserPermissionsMutation.mutateAsync({
      userId,
      payload: {
        permissions: buildPermissionPayload()
      }
    });
    const nextDraft: Record<string, boolean> = {};
    response.permissions.forEach((permission) => {
      nextDraft[permission.permission_code] = permission.is_allowed;
    });
    setPermissionDraft(nextDraft);
    return response;
  };

  const submitUser = form.handleSubmit(async (values) => {
    setSaveMessage(null);
    setSaveError(null);

    if (isCreateMode) {
      if (!values.password.trim()) {
        form.setError("password", { message: "Укажите пароль" });
        return;
      }

      const user = await createUserMutation.mutateAsync(mapFormValuesToUserPayload(values));
      onCreated(user.id);
      onClose();
      return;
    }

    if (!userQuery.data || !userId) {
      return;
    }

    try {
      await updateUserMutation.mutateAsync({
        userId,
        payload: mapFormValuesToUserUpdatePayload(values, userQuery.data)
      });

      if (values.password.trim()) {
        await resetPasswordMutation.mutateAsync({ userId, newPassword: values.password });
        form.setValue("password", "");
      }

      if (!isAdminUser && userPermissionsQuery.data) {
        await handleSavePermissions();
      }

      setSaveMessage("Пользователь сохранён");
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить пользователя");
    }
  });

  if (!userKey) {
    return null;
  }

  const content = (
    <aside className={cn(panelBaseClassName, isMobile ? "fixed inset-0 h-svh w-full" : centeredDesktopClassName)} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          {!isCreateMode && viewMode === "activity" ? (
            <AppButton size="icon" variant="ghost" onClick={() => setViewMode("details")} aria-label="Назад к пользователю">
              <ArrowLeft className="h-4 w-4" />
            </AppButton>
          ) : null}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Пользователь</p>
            <h2 className="mt-1 text-lg font-semibold">{panelTitle}</h2>
          </div>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть пользователя">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!isCreateMode && userQuery.isLoading ? (
          <LoadingState title="Загружаем пользователя" description="Получаем учётную запись и действия пользователя." />
        ) : null}

        {!isCreateMode && userQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить пользователя"
            description="Проверьте подключение и попробуйте открыть карточку ещё раз."
            actionLabel="Повторить"
            onAction={() => void userQuery.refetch()}
          />
        ) : null}

        {isCreateMode || userQuery.data ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitUser}>
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="space-y-5">
                {viewMode === "details" ? (
                  <>
                    <section className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded-2xl bg-accent-muted p-2 text-foreground">
                            <ShieldUser className="h-4 w-4" />
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">Данные пользователя</h3>
                            {!isCreateMode && userQuery.data ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <StatusBadge label={userQuery.data.is_active ? "Активно" : "В архиве"} tone={userQuery.data.is_active ? "success" : "muted"} />
                                <StatusBadge label={userQuery.data.role_code === "admin" ? "Администратор" : "Пользователь"} tone="muted" />
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {!isCreateMode && userQuery.data ? (
                          <div className="flex flex-wrap gap-2">
                            <AppButton type="button" variant="outline" onClick={() => setViewMode("activity")}>
                              Посмотреть действия
                            </AppButton>
                            {userQuery.data.is_active ? (
                              <AppButton type="button" variant="outline" className="border-danger/40 text-danger hover:bg-danger/10" disabled={setUserActiveMutation.isPending} onClick={() => void handleActiveStateChange(false)}>
                                <Archive className="h-4 w-4" />
                                Архивировать
                              </AppButton>
                            ) : (
                              <AppButton type="button" variant="outline" disabled={setUserActiveMutation.isPending} onClick={() => void handleActiveStateChange(true)}>
                                <RotateCcw className="h-4 w-4" />
                                Восстановить
                              </AppButton>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-4">
                        <Field label="ФИО" error={form.formState.errors.full_name?.message}>
                          <AppInput {...form.register("full_name")} />
                        </Field>

                        <Field label="Логин" error={form.formState.errors.login?.message}>
                          <AppInput {...form.register("login")} />
                        </Field>

                        <Field
                          label="Пароль"
                          error={form.formState.errors.password?.message}
                          hint={isCreateMode ? "Пароль нужен для первой авторизации." : "Оставьте поле пустым, если пароль менять не нужно."}
                        >
                          <div className="relative">
                            <AppInput type="password" placeholder="Введите пароль" {...form.register("password")} />
                            <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </Field>
                      </div>
                    </section>

                    {saveMessage ? (
                      <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{saveMessage}</div>
                    ) : null}

                    {saveError ? (
                      <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{saveError}</div>
                    ) : null}

                    {(createUserMutation.isError || updateUserMutation.isError || resetPasswordMutation.isError || updateUserPermissionsMutation.isError || setUserActiveMutation.isError) ? (
                      <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                        {(createUserMutation.error ?? updateUserMutation.error ?? resetPasswordMutation.error ?? updateUserPermissionsMutation.error ?? setUserActiveMutation.error)?.message}
                      </div>
                    ) : null}

                    {!isCreateMode && userQuery.data ? (
                      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Права</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Администратор всегда получает все права автоматически. Для пользователя ниже доступны переключатели прав и индивидуальные overrides.
                            </p>
                          </div>
                          {isAdminUser ? <StatusBadge label="Администратор: все права" tone="muted" /> : null}
                        </div>

                        {isAdminUser ? (
                          <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                            Администратор не использует переключатели прав пользователей. Все права доступны автоматически.
                          </div>
                        ) : userPermissionsQuery.isLoading ? (
                          <LoadingState compact title="Загружаем права" description="Получаем текущие switches пользователя." />
                        ) : userPermissionsQuery.isError ? (
                          <ErrorState
                            title="Не удалось загрузить права"
                            description="Попробуйте обновить карточку пользователя."
                            actionLabel="Повторить"
                            onAction={() => void userPermissionsQuery.refetch()}
                          />
                        ) : (
                          <div className="space-y-4">
                            {PERMISSION_GROUPS.map((group) => (
                              <section key={group.title} className="rounded-xl border border-border/80 bg-background p-4">
                                <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
                                <div className="mt-3 divide-y divide-border/60">
                                  {group.items.map((item) => (
                                    <label key={item.code} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                                      <span className="text-sm text-foreground">{item.label}</span>
                                      <AppSwitch
                                        checked={permissionDraft[item.code] ?? false}
                                        disabled={updateUserPermissionsMutation.isPending}
                                        onChange={(checked) => handlePermissionChange(item.code, checked)}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </section>
                            ))}

                            <div className="flex flex-wrap justify-end gap-2">
                              <AppButton
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const nextDraft: Record<string, boolean> = {};
                                  userPermissions.forEach((permission) => {
                                    nextDraft[permission.permission_code] = permission.is_allowed;
                                  });
                                  setPermissionDraft(nextDraft);
                                }}
                                disabled={updateUserPermissionsMutation.isPending || !hasPermissionChanges}
                              >
                                Сбросить
                              </AppButton>
                              <AppButton
                                type="button"
                                onClick={() =>
                                  void (async () => {
                                    try {
                                      setSaveError(null);
                                      setSaveMessage(null);
                                      await handleSavePermissions();
                                      setSaveMessage("Права пользователя сохранены");
                                    } catch (error) {
                                      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить права");
                                    }
                                  })()
                                }
                                disabled={updateUserPermissionsMutation.isPending || !hasPermissionChanges}
                              >
                                {updateUserPermissionsMutation.isPending ? "Сохраняем..." : "Сохранить права"}
                              </AppButton>
                            </div>
                          </div>
                        )}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <section className="space-y-4">
                    {userActivityQuery.isLoading ? <LoadingState title="Загружаем действия" description="Собираем ленту действий пользователя по CRM." /> : null}

                    {userActivityQuery.isError ? (
                      <ErrorState
                        title="Не удалось загрузить действия"
                        description="Попробуйте обновить ленту или вернуться к карточке пользователя."
                        actionLabel="Повторить"
                        onAction={() => void userActivityQuery.refetch()}
                      />
                    ) : null}

                    {!userActivityQuery.isLoading && !userActivityQuery.isError ? (
                      userActivityQuery.data?.activities.length ? (
                        <div className="space-y-3">
                          {userActivityQuery.data.activities.map((activity) => (
                            <div key={activity.id} className="rounded-2xl border border-border bg-surface p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-foreground">{activity.title}</div>
                                  {activity.description ? <div className="mt-2 text-sm text-muted-foreground">{activity.description}</div> : null}
                                </div>
                                <StatusBadge label={mapEntityTypeLabel(activity.entity_type)} tone="muted" />
                              </div>
                              <div className="mt-3 text-xs text-muted-foreground">{formatDateTime(activity.created_at)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState title="Пока нет действий" description="Новые действия пользователя будут появляться здесь автоматически." />
                      )
                    ) : null}
                  </section>
                )}
              </div>
            </div>

            {viewMode === "details" ? (
              <div className="mobile-sheet-footer shrink-0 border-t border-border px-4 py-4 sm:px-5">
                <AppButton
                  className="flex-1"
                  type="submit"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending || resetPasswordMutation.isPending}
                >
                  {createUserMutation.isPending || updateUserMutation.isPending || resetPasswordMutation.isPending
                    ? "Сохраняем..."
                    : isCreateMode
                      ? "Создать пользователя"
                      : "Сохранить пользователя"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="outline"
                  onClick={() => (userQuery.data ? form.reset(mapUserToFormValues(userQuery.data)) : form.reset(emptyValues))}
                >
                  Сбросить
                </AppButton>
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </aside>
  );

  if (isMobile) {
    return <MobileSheet onClose={onClose}>{content}</MobileSheet>;
  }

  return (
    <div className="fixed inset-0 z-[240] hidden bg-black/35 backdrop-blur-sm dark:bg-black/60 lg:block" onClick={onClose}>
      <div className="h-full w-full">{content}</div>
    </div>
  );
}

function Field({
  children,
  error,
  hint,
  label
}: {
  children: ReactNode;
  error?: string;
  hint?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="mt-2 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function mapEntityTypeLabel(entityType: string) {
  switch (entityType) {
    case "client":
      return "Клиент";
    case "vehicle":
      return "Авто";
    case "order":
      return "Заказ";
    case "reminder":
      return "Напоминание";
    case "document":
      return "Документ";
    case "user":
      return "Пользователь";
    default:
      return "Система";
  }
}
