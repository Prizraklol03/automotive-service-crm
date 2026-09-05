import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useCan } from "@/features/auth/model/permissions";
import { useUsersListQuery } from "@/features/users/api/users-hooks";
import { UserDetailPanel } from "@/features/users/ui/user-detail-panel";
import { UsersList } from "@/features/users/ui/users-list";
import { formatNumber } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { useMediaQuery } from "@/shared/hooks/use-media-query";

export function UsersPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedUserKey = searchParams.get("user");
  const selectedUserId = selectedUserKey && selectedUserKey !== "new" ? Number(selectedUserKey) : null;
  const canManageUsers = useCan("settings.users.manage");

  const [view, setView] = useState<"active" | "archive">("active");
  const activeUsersQuery = useUsersListQuery(true);
  const archivedUsersQuery = useUsersListQuery(false);
  const usersQuery = view === "active" ? activeUsersQuery : archivedUsersQuery;
  const users = usersQuery.data ?? [];
  const usersCountLabel = useMemo(() => `${formatNumber(users.length)} пользователей`, [users.length]);

  const updateUserParam = (value?: string | null) => {
    const next = new URLSearchParams(searchParams);

    if (!value) {
      next.delete("user");
    } else {
      next.set("user", value);
    }

    next.delete("employee");

    setSearchParams(next, { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Пользователи"
        description={usersCountLabel}
        actions={
          <>
            {canManageUsers ? <AppButton onClick={() => updateUserParam("new")}>+ Добавить пользователя</AppButton> : null}
          </>
        }
      />

      <section className="min-w-0">
        <div className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Состояние пользователей">
          <AppButton
            type="button"
            size="sm"
            variant={view === "active" ? "default" : "ghost"}
            role="tab"
            aria-selected={view === "active"}
            onClick={() => setView("active")}
          >
            Активные
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            variant={view === "archive" ? "default" : "ghost"}
            role="tab"
            aria-selected={view === "archive"}
            onClick={() => setView("archive")}
          >
            Архив
          </AppButton>
        </div>

        {usersQuery.isLoading ? <LoadingState title="Загружаем пользователей" description="Получаем список пользователей и их учётных записей." /> : null}

        {usersQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить пользователей"
            description="Проверьте подключение и повторите попытку."
            actionLabel="Повторить"
            onAction={() => void usersQuery.refetch()}
          />
        ) : null}

        {!usersQuery.isLoading && !usersQuery.isError ? (
          users.length ? (
            <UsersList users={users} onOpenUser={(userId) => updateUserParam(String(userId))} selectedUserId={selectedUserId} />
          ) : (
            <EmptyState
              title={view === "active" ? "Активные пользователи не найдены" : "Архив пользователей пуст"}
              description={view === "active" ? "Добавьте первого пользователя, чтобы выдать ему доступ в CRM." : "Архивированные учётные записи появятся здесь."}
              action={canManageUsers ? <AppButton onClick={() => updateUserParam("new")}>+ Добавить пользователя</AppButton> : null}
            />
          )
        ) : null}
      </section>

      {selectedUserKey ? (
        <UserDetailPanel
          userKey={selectedUserKey}
          isMobile={isMobile}
          onClose={() => updateUserParam(null)}
          onCreated={(userId) => updateUserParam(String(userId))}
        />
      ) : null}
    </PageContainer>
  );
}
