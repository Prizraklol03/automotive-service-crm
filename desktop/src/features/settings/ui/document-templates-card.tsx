import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";

import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/entities/document/model/types";
import { useDocumentTemplatesQuery, useUploadDocumentTemplateMutation } from "@/features/settings/api/settings-hooks";
import { AppButton } from "@/shared/ui/app-button";

const DOCUMENT_TYPE_ORDER: DocumentType[] = [
  "preliminary_work_order",
  "work_order",
  "completion_act",
  "inspection_act",
];

function getFilename(storagePath: string) {
  const parts = storagePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? storagePath;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function DocumentTemplatesCard() {
  const templatesQuery = useDocumentTemplatesQuery();
  const uploadMutation = useUploadDocumentTemplateMutation();
  const inputRefs = useRef<Partial<Record<DocumentType, HTMLInputElement | null>>>({});
  const [activeType, setActiveType] = useState<DocumentType | null>(null);

  async function handleFileChange(documentType: DocumentType, file: File | null) {
    if (!file) {
      return;
    }

    setActiveType(documentType);
    try {
      await uploadMutation.mutateAsync({ documentType, file });
    } finally {
      setActiveType(null);
      const input = inputRefs.current[documentType];
      if (input) {
        input.value = "";
      }
    }
  }

  if (templatesQuery.isLoading) {
    return (
      <div className="glass-panel flex items-center gap-3 rounded-2xl p-5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Загружаем шаблоны документов…</span>
      </div>
    );
  }

  if (templatesQuery.isError) {
    return (
      <div className="glass-panel rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-semibold">Шаблоны документов</h2>
        <p className="mt-2 text-sm text-danger">
          {templatesQuery.error?.message ?? "Не удалось загрузить список шаблонов документов"}
        </p>
      </div>
    );
  }

  const templatesByCode = new Map(templatesQuery.data?.map((template) => [template.code, template]));

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold">Шаблоны документов</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Загружайте новую версию шаблона DOCX в любой момент. Следующие рендеры документов будут использовать
          актуальный шаблон выбранного типа.
        </p>
      </div>

      <div className="space-y-3">
        {DOCUMENT_TYPE_ORDER.map((documentType) => {
          const template = templatesByCode.get(documentType);
          const isUploading = uploadMutation.isPending && activeType === documentType;

          return (
            <div
              key={documentType}
              className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface/60 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{DOCUMENT_TYPE_LABELS[documentType]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Текущий файл: {template ? getFilename(template.storage_path) : "Шаблон ещё не загружен"}
                </p>
                {template ? (
                  <p className="mt-1 text-xs text-muted-foreground">Обновлён: {formatTimestamp(template.updated_at)}</p>
                ) : null}
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <input
                  ref={(node) => {
                    inputRefs.current[documentType] = node;
                  }}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(event) => void handleFileChange(documentType, event.target.files?.[0] ?? null)}
                />
                <AppButton
                  type="button"
                  variant="outline"
                  onClick={() => inputRefs.current[documentType]?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  {template ? "Загрузить новую версию" : "Загрузить шаблон"}
                </AppButton>
              </div>
            </div>
          );
        })}
      </div>

      {uploadMutation.isError ? (
        <p className="mt-4 text-sm text-danger">
          {uploadMutation.error?.message ?? "Не удалось загрузить новый шаблон документа"}
        </p>
      ) : null}
    </div>
  );
}
