import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import {
  useCreateFinanceCategoryMutation,
  useDeleteFinanceCategoryMutation,
  useFinanceCategoriesQuery,
  useUpdateFinanceCategoryMutation
} from "@/features/finance/api/finance-hooks";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";

export function FinanceCategoriesModal({
  isMobile,
  onClose,
  open
}: {
  isMobile: boolean;
  onClose: () => void;
  open: boolean;
}) {
  useOverlayMode(open, onClose);
  const categoriesQuery = useFinanceCategoriesQuery();
  const createMutation = useCreateFinanceCategoryMutation();
  const updateMutation = useUpdateFinanceCategoryMutation();
  const deleteMutation = useDeleteFinanceCategoryMutation();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");

  const busyId = useMemo(() => {
    if (updateMutation.variables) {
      return updateMutation.variables.categoryId;
    }
    return null;
  }, [updateMutation.variables]);

  if (!open) {
    return null;
  }

  const content = (
    <aside
      className={cn(
        "z-50 flex flex-col overflow-hidden bg-background shadow-panel",
        isMobile
          ? "fixed inset-0 h-svh w-full"
          : "fixed left-1/2 top-1/2 hidden max-h-[min(760px,calc(100svh-2rem))] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex"
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Финансы</p>
          <h2 className="mt-1 text-lg font-semibold">Категории расходов</h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть категории расходов">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mb-5 rounded-2xl border border-border bg-surface/80 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <AppInput
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Название категории"
            />
            <AppButton
              className="sm:w-auto"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => {
                void createMutation.mutateAsync({ name: newName.trim() }).then(() => {
                  setNewName("");
                  onClose();
                });
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Добавить категорию
            </AppButton>
          </div>
          {createMutation.isError ? <p className="mt-3 text-sm text-danger">{createMutation.error.message}</p> : null}
        </div>

        {categoriesQuery.isLoading ? <LoadingState title="Загружаем категории" description="Подготавливаем список финансовых категорий." /> : null}
        {categoriesQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить категории"
            description="Попробуйте обновить список ещё раз."
            actionLabel="Повторить"
            onAction={() => void categoriesQuery.refetch()}
          />
        ) : null}

        {!categoriesQuery.isLoading && !categoriesQuery.isError ? (
          categoriesQuery.data?.length ? (
            <div className="space-y-3">
              {categoriesQuery.data.map((category) => {
                const isEditing = editingId === category.id;
                return (
                  <div key={category.id} className="rounded-2xl border border-border bg-surface/70 p-4">
                    {isEditing ? (
                      <div className="space-y-3">
                        <AppInput value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <AppButton
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setEditingId(null);
                              setDraftName("");
                            }}
                          >
                            Отменить
                          </AppButton>
                          <AppButton
                            type="button"
                            disabled={!draftName.trim() || updateMutation.isPending}
                            onClick={() => {
                              void updateMutation
                                .mutateAsync({ categoryId: category.id, payload: { name: draftName.trim() } })
                                .then(() => {
                                  setEditingId(null);
                                  setDraftName("");
                                  onClose();
                                });
                            }}
                          >
                            Сохранить
                          </AppButton>
                        </div>
                        {updateMutation.isError && busyId === category.id ? (
                          <p className="text-sm text-danger">{updateMutation.error.message}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{category.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Можно переименовать или удалить, если категория не используется.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <AppButton
                            size="icon"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(category.id);
                              setDraftName(category.name);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </AppButton>
                          <AppButton
                            size="icon"
                            type="button"
                            variant="ghost"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (!window.confirm(`Удалить категорию "${category.name}"?`)) {
                                return;
                              }
                              void deleteMutation.mutateAsync(category.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </AppButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {deleteMutation.isError ? <p className="text-sm text-danger">{deleteMutation.error.message}</p> : null}
            </div>
          ) : (
            <EmptyState title="Категорий пока нет" description="Добавьте первую категорию, чтобы заносить финансовые расходы." />
          )
        ) : null}
      </div>
    </aside>
  );

  if (isMobile) {
    return <MobileSheet closeOnBackdropClick={false} onClose={onClose}>{content}</MobileSheet>;
  }

  return <div className="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm lg:block">{content}</div>;
}
