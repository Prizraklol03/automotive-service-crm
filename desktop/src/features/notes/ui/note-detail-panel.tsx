import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { z } from "zod";

import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useNoteDetailQuery,
  useUpdateNoteMutation
} from "@/features/notes/api/notes-hooks";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { normalizePhoneNumber } from "@/shared/lib/phone";
import { AppButton } from "@/shared/ui/app-button";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { PhoneInput } from "@/shared/ui/phone-input";

const formSchema = z.object({
  telephone: z
    .string()
    .trim()
    .max(32)
    .refine((value) => !value || normalizePhoneNumber(value) !== null, "Введите корректный номер РФ"),
  comment: z.string().trim().min(1, "Введите комментарий")
});

type FormValues = z.infer<typeof formSchema>;

export function NoteDetailPanel({
  isMobile,
  noteKey,
  onClose
}: {
  isMobile: boolean;
  noteKey: string | null;
  onClose: () => void;
}) {
  useOverlayMode(Boolean(noteKey), onClose);
  const noteId = noteKey && noteKey !== "new" ? Number(noteKey) : null;
  const isCreateMode = noteKey === "new";
  const currentUser = useAuthStore((state) => state.user);
  const detailQuery = useNoteDetailQuery(noteId);
  const createMutation = useCreateNoteMutation();
  const updateMutation = useUpdateNoteMutation();
  const deleteMutation = useDeleteNoteMutation();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      telephone: "",
      comment: ""
    }
  });

  useEffect(() => {
    if (isCreateMode) {
      form.reset({ telephone: "", comment: "" });
      return;
    }

    if (detailQuery.data) {
      form.reset({
        telephone: detailQuery.data.telephone ?? "",
        comment: detailQuery.data.comment
      });
    }
  }, [detailQuery.data, form, isCreateMode]);

  if (!noteKey) {
    return null;
  }

  const note = detailQuery.data;
  const creatorName = note?.created_by_user_name ?? currentUser?.full_name ?? "Пользователь CRM";

  const content = (
    <aside
      className={cn(
        "z-50 flex flex-col overflow-hidden bg-background shadow-panel",
        isMobile
          ? "fixed inset-0 h-svh w-full"
          : "fixed left-1/2 top-1/2 hidden max-h-[min(760px,calc(100svh-2rem))] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex"
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Заметки</p>
          <h2 className="mt-1 text-lg font-semibold">{isCreateMode ? "Новая заметка" : "Карточка заметки"}</h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть заметку">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
        {!isCreateMode && detailQuery.isLoading ? (
          <LoadingState title="Загружаем заметку" description="Подготавливаем карточку для редактирования." />
        ) : null}

        {!isCreateMode && detailQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить заметку"
            description="Попробуйте открыть заметку снова."
            actionLabel="Повторить"
            onAction={() => void detailQuery.refetch()}
          />
        ) : null}

        {isCreateMode || note ? (
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
              const payload = {
                telephone: values.telephone.trim() ? normalizePhoneNumber(values.telephone) : null,
                comment: values.comment.trim()
              };

              if (isCreateMode) {
                await createMutation.mutateAsync(payload);
              } else if (noteId) {
                await updateMutation.mutateAsync({ noteId, payload });
              }

              onClose();
            })}
          >
            <Field label="Номер">
              <Controller
                control={form.control}
                name="telephone"
                render={({ field }) => (
                  <PhoneInput
                    placeholder="+7 (999) 999-99-99"
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>

            <Field error={form.formState.errors.comment?.message} label="Комментарий">
              <AppTextarea rows={10} {...form.register("comment")} />
            </Field>

            <Field label="Кто создал">
              <div className="rounded-xl border border-input bg-surface px-3 py-3 text-sm text-foreground">
                <div>{creatorName}</div>
                {note?.created_at ? (
                  <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(note.created_at)}</div>
                ) : null}
              </div>
            </Field>

            {createMutation.isError || updateMutation.isError || deleteMutation.isError ? (
              <p className="text-sm text-danger">
                {createMutation.error?.message ??
                  updateMutation.error?.message ??
                  deleteMutation.error?.message ??
                  "Не удалось сохранить заметку"}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
              <div>
                {!isCreateMode && noteId ? (
                  <AppButton
                    type="button"
                    variant="ghost"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (!window.confirm("Удалить заметку?")) {
                        return;
                      }
                      void deleteMutation.mutateAsync(noteId).then(() => onClose());
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </AppButton>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <AppButton type="button" variant="outline" onClick={onClose}>
                  Отменить
                </AppButton>
                <AppButton type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  Сохранить
                </AppButton>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </aside>
  );

  if (isMobile) {
    return <MobileSheet closeOnBackdropClick={false} onClose={onClose}>{content}</MobileSheet>;
  }

  return (
    <div className="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm lg:block">
      {content}
    </div>
  );
}

function Field({
  children,
  error,
  label
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </label>
  );
}
