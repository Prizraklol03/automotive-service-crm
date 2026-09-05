import { AppButton } from "@/shared/ui/app-button";

export function UnsavedChangesBanner({
  onCloseWithoutSaving,
  onDismiss,
  visible
}: {
  onCloseWithoutSaving: () => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
      <div className="font-medium text-foreground">Есть несохранённые изменения</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Продолжайте редактирование или закройте карточку без сохранения, если изменения не нужны.
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AppButton type="button" size="sm" variant="outline" onClick={onDismiss}>
          Продолжить редактирование
        </AppButton>
        <AppButton type="button" size="sm" variant="ghost" onClick={onCloseWithoutSaving}>
          Закрыть без сохранения
        </AppButton>
      </div>
    </div>
  );
}
