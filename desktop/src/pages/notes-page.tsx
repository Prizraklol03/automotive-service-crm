import { FileText, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useNotesQuery } from "@/features/notes/api/notes-hooks";
import { NoteDetailPanel } from "@/features/notes/ui/note-detail-panel";
import { AppButton } from "@/shared/ui/app-button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { formatDateTime } from "@/shared/lib/format";
import { formatPhoneDisplay } from "@/shared/lib/phone";
import { LoadingState } from "@/shared/ui/loading-state";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { SearchInput } from "@/shared/ui/search-input";

export function NotesPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const noteKey = searchParams.get("note");
  const search = searchParams.get("q") ?? "";
  const notesQuery = useNotesQuery(search);
  const notes = notesQuery.data ?? [];

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Заметки"
        description="Общие заметки CRM с поиском по телефону или ID."
        actions={
          <AppButton onClick={() => updateParams({ note: "new" })}>
            <Plus className="h-4 w-4" />
            Новая заметка
          </AppButton>
        }
      />

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <SearchInput
          value={search}
          onChange={(event) => {
            const next = event.target.value;
            updateParams({ q: next.trim() ? next : null });
          }}
          placeholder="Поиск по телефону или ID заметки"
        />
      </section>

      {notesQuery.isLoading ? (
        <LoadingState title="Загружаем заметки" description="Собираем общий список по CRM." />
      ) : null}

      {notesQuery.isError ? (
        <ErrorState
          title="Не удалось загрузить заметки"
          description="Проверьте подключение и попробуйте снова."
          actionLabel="Повторить"
          onAction={() => void notesQuery.refetch()}
        />
      ) : null}

      {!notesQuery.isLoading && !notesQuery.isError ? (
        notes.length ? (
          <div className="space-y-4">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => updateParams({ note: String(note.id) })}
                className="glass-panel w-full rounded-2xl px-4 py-4 text-left transition-colors hover:bg-surface-2/50"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">Заметка #{note.number}</div>
                    {note.telephone ? (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatPhoneDisplay(note.telephone) ?? note.telephone}
                      </div>
                    ) : null}
                    <div className="mt-2 line-clamp-4 text-sm text-muted-foreground">{note.comment}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{note.created_by_user_name}</div>
                    <div className="mt-1">{formatDateTime(note.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Заметок пока нет"
            description="Создайте первую общую заметку для CRM."
            action={
              <AppButton onClick={() => updateParams({ note: "new" })}>
                <FileText className="h-4 w-4" />
                Новая заметка
              </AppButton>
            }
          />
        )
      ) : null}

      <NoteDetailPanel isMobile={isMobile} noteKey={noteKey} onClose={() => updateParams({ note: null })} />
    </PageContainer>
  );
}
