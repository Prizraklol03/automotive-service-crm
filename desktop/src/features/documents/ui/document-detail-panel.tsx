import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileDown, X } from "lucide-react";

import { DOCUMENT_TYPE_LABELS } from "@/entities/document/model/types";
import { useDocumentDetailQuery, useDocumentPreviewQuery, useUpdateDocumentWorkDatesMutation } from "@/features/documents/api/documents-hooks";
import { cn } from "@/shared/lib/cn";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { downloadFile } from "@/shared/lib/download";
import { formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

const panelBaseClassName = "z-50 flex flex-col overflow-hidden bg-background shadow-panel";
const centeredDesktopClassName =
  "fixed left-1/2 top-1/2 hidden max-h-[min(860px,calc(100svh-2rem))] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex";

function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function mergeDateWithTime(dateValue: string, sourceValue: string | null | undefined) {
  const timeMatch = sourceValue?.match(/T(\d{2}:\d{2}:\d{2})/);
  return `${dateValue}T${timeMatch?.[1] ?? "00:00:00"}`;
}

function statusLabel(hasDocumentFile: boolean, hasPdfFile: boolean, unresolvedCount: number) {
  if (unresolvedCount) {
    return "Требует проверки";
  }
  if (hasPdfFile) {
    return "PDF готов";
  }
  if (hasDocumentFile) {
    return "DOCX готов";
  }
  return "Не создан";
}

function statusTone(hasDocumentFile: boolean, hasPdfFile: boolean, unresolvedCount: number) {
  if (unresolvedCount) {
    return "warning" as const;
  }
  if (hasPdfFile) {
    return "success" as const;
  }
  if (hasDocumentFile) {
    return "accent" as const;
  }
  return "muted" as const;
}

export function DocumentDetailPanel({
  documentId,
  isMobile,
  onClose,
  onOpenClient,
  onOpenOrder,
  onOpenVehicle
}: {
  documentId: number | null;
  isMobile: boolean;
  onClose: () => void;
  onOpenClient?: (clientId: number) => void;
  onOpenOrder?: (orderId: number) => void;
  onOpenVehicle?: (vehicleId: number) => void;
}) {
  useOverlayMode(documentId !== null, onClose);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "danger">("success");
  const [downloadingFormat, setDownloadingFormat] = useState<"docx" | "pdf" | null>(null);
  const [workStartedOn, setWorkStartedOn] = useState("");
  const [workCompletedOn, setWorkCompletedOn] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const documentQuery = useDocumentDetailQuery(documentId);
  const document = documentQuery.data;
  const previewQuery = useDocumentPreviewQuery(documentId, isPreviewOpen);
  const updateWorkDatesMutation = useUpdateDocumentWorkDatesMutation();

  useEffect(() => {
    setWorkStartedOn(toDateInputValue(document?.work_started_at));
    setWorkCompletedOn(toDateInputValue(document?.work_completed_at));
  }, [document?.work_completed_at, document?.work_started_at]);

  useEffect(() => {
    setIsPreviewOpen(false);
  }, [documentId]);

  if (documentId === null) {
    return (
      <aside className={cn(panelBaseClassName, centeredDesktopClassName)}>
        <div className="flex h-full items-center px-6">
          <EmptyState
            title="Выберите документ"
            description="Откройте документ из списка, чтобы увидеть превью, связанные сущности и действия с файлами."
          />
        </div>
      </aside>
    );
  }

  const containerClassName = cn(panelBaseClassName, isMobile ? "fixed inset-0 h-svh w-full" : centeredDesktopClassName);

  const handleDownload = async (format: "docx" | "pdf") => {
    try {
      setDownloadingFormat(format);
      const preferredFilename =
        format === "pdf" ? (document?.pdf_file.filename ?? null) : (document?.docx_file.filename ?? null);
      await downloadFile(`/documents/${documentId}/download/${format}`, preferredFilename);
      setFeedbackTone("success");
      setFeedbackMessage(format === "pdf" ? "PDF обновлён и скачан" : "DOCX обновлён и скачан");
    } catch (error) {
      setFeedbackTone("danger");
      setFeedbackMessage(error instanceof Error ? error.message : "Не удалось скачать файл");
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleSaveWorkDates = async () => {
    if (!document || !workStartedOn) {
      return;
    }

    const payload = {
      work_started_at: mergeDateWithTime(workStartedOn, document.work_started_at),
      work_completed_at: workCompletedOn ? mergeDateWithTime(workCompletedOn, document.work_completed_at) : null
    };

    await updateWorkDatesMutation.mutateAsync({ documentId: document.id, payload });
    setFeedbackMessage("Даты документа сохранены");
  };

  const content = (
    <aside className={containerClassName} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Документ</p>
          <h2 className="mt-1 text-lg font-semibold">
            {document ? DOCUMENT_TYPE_LABELS[document.document_type] : `#${documentId}`}
          </h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть документ">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
        {documentQuery.isLoading ? (
          <LoadingState title="Загружаем документ" description="Получаем состояние файлов, превью и связанный контекст заказа." />
        ) : null}

        {documentQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить документ"
            description="Попробуйте обновить выборку или открыть другой документ."
            actionLabel="Повторить"
            onAction={() => void documentQuery.refetch()}
          />
        ) : null}

        {document ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    № {document.document_number} · {DOCUMENT_TYPE_LABELS[document.document_type]}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {!document.docx_file.exists && !document.pdf_file.exists ? "Не создан" : "Обновляется автоматически перед скачиванием"}
                  </div>
                </div>
                <StatusBadge
                  label={statusLabel(document.docx_file.exists, document.pdf_file.exists, document.unresolved_placeholders.length)}
                  tone={statusTone(document.docx_file.exists, document.pdf_file.exists, document.unresolved_placeholders.length)}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <AppButton size="sm" variant="ghost" disabled={downloadingFormat === "docx"} onClick={() => void handleDownload("docx")}>
                  <FileDown className="h-4 w-4" />
                  {downloadingFormat === "docx" ? "Скачиваем..." : "Скачать DOCX"}
                </AppButton>
                <AppButton size="sm" variant="ghost" disabled={downloadingFormat === "pdf"} onClick={() => void handleDownload("pdf")}>
                  <FileDown className="h-4 w-4" />
                  {downloadingFormat === "pdf" ? "Скачиваем..." : "Скачать PDF"}
                </AppButton>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">Даты работ</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Дата начала работ</span>
                  <AppInput type="date" value={workStartedOn} onChange={(event) => setWorkStartedOn(event.target.value)} />
                </div>
                <div className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Дата окончания работ</span>
                  <AppInput type="date" value={workCompletedOn} onChange={(event) => setWorkCompletedOn(event.target.value)} />
                </div>
              </div>
              <div className="mt-4 flex justify-start">
                <AppButton type="button" disabled={!workStartedOn || updateWorkDatesMutation.isPending} onClick={() => void handleSaveWorkDates()}>
                  {updateWorkDatesMutation.isPending ? "Сохраняем..." : "Сохранить даты"}
                </AppButton>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                По умолчанию берутся дата создания заказа и дата завершения заказа, но здесь их можно менять отдельно для документа.
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">Связанный контекст</h3>
              <div className="mt-4 space-y-2 text-sm">
                <div>
                  Заказ:{" "}
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => onOpenOrder?.(document.order_id)}
                  >
                    #{document.order_id}
                  </button>
                </div>
                <div>
                  Клиент:{" "}
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => onOpenClient?.(document.order_summary.client_summary.id)}
                  >
                    {document.order_summary.client_summary.full_name}
                  </button>
                </div>
                <div>
                  Авто:{" "}
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => onOpenVehicle?.(document.order_summary.vehicle_summary.id)}
                  >
                    {document.order_summary.vehicle_summary.display_name}
                  </button>
                </div>
                <div className="text-muted-foreground">Последний рендер: {formatDateTime(document.last_rendered_at)}</div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Превью</h3>
                <AppButton type="button" size="sm" variant="outline" onClick={() => setIsPreviewOpen((current) => !current)}>
                  {isPreviewOpen ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Скрыть
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Показать
                    </>
                  )}
                </AppButton>
              </div>
              {!isPreviewOpen ? (
                <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  Превью не загружается, пока блок не раскрыт.
                </div>
              ) : (
                <>
                  {previewQuery.isLoading ? (
                    <div className="mt-4">
                      <LoadingState title="Собираем превью" description="Подготавливаем текстовое представление документа." />
                    </div>
                  ) : null}
                  {previewQuery.isError ? (
                    <div className="mt-4">
                      <ErrorState
                        title="Превью недоступно"
                        description="Не удалось получить превью. Файлы документа при этом по-прежнему можно скачать."
                        actionLabel="Повторить"
                        onAction={() => void previewQuery.refetch()}
                      />
                    </div>
                  ) : null}
                  {previewQuery.data ? (
                    <>
                      <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                        {previewQuery.data.preview_content}
                      </div>
                      {previewQuery.data.unresolved_placeholders.length ? (
                        <div className="mt-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                          Незаполненные плейсхолдеры: {previewQuery.data.unresolved_placeholders.join(", ")}
                        </div>
                      ) : null}
                      {previewQuery.data.manual_fields_by_design.length ? (
                        <div className="mt-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
                          Ручные поля по шаблону: {previewQuery.data.manual_fields_by_design.join(", ")}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </section>

            {feedbackMessage ? (
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm",
                  feedbackTone === "danger"
                    ? "border border-danger/20 bg-danger/10 text-danger"
                    : "border border-success/20 bg-success/10 text-success"
                )}
              >
                {feedbackMessage}
              </div>
            ) : null}

            {updateWorkDatesMutation.isError ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                {updateWorkDatesMutation.error?.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );

  if (documentId !== null && isMobile) {
    return <MobileSheet onClose={onClose}>{content}</MobileSheet>;
  }

  return documentId !== null ? (
    <div className="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm lg:block">
      {content}
    </div>
  ) : (
    content
  );
}
