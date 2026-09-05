import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileDown, FileText } from "lucide-react";

import { useCan } from "@/features/auth/model/permissions";
import {
  downloadOrderDocumentDocxRequestPath,
  downloadOrderDocumentPdfRequestPath
} from "@/entities/document/api/document-api";
import { DOCUMENT_TYPE_LABELS, type Document, type DocumentType } from "@/entities/document/model/types";
import {
  useEnsureOrderDocumentMutation,
  useOrderDocumentsQuery,
  useUpdateDocumentWorkDatesMutation
} from "@/features/documents/api/documents-hooks";
import { useOrderDetailQuery } from "@/features/orders/api/orders-hooks";
import { cn } from "@/shared/lib/cn";
import { downloadFile } from "@/shared/lib/download";
import { getDefaultDateTimeValue } from "@/shared/lib/datetime";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";

const documentTypeOptions = ["preliminary_work_order", "work_order", "completion_act", "inspection_act"] as const;
type OrderDocumentType = (typeof documentTypeOptions)[number];

type DocumentCardItem = {
  document: Document | null;
  documentType: OrderDocumentType;
};

type DateDraft = {
  workCompletedAt: string;
  workStartedAt: string;
};

type DateDraftDirtyState = Record<OrderDocumentType, { workCompletedAt: boolean; workStartedAt: boolean }>;

const EMPTY_DATE_DRAFT: DateDraft = {
  workCompletedAt: "",
  workStartedAt: ""
};

const EMPTY_DATE_DRAFTS: Record<OrderDocumentType, DateDraft> = {
  completion_act: { ...EMPTY_DATE_DRAFT },
  inspection_act: { ...EMPTY_DATE_DRAFT },
  preliminary_work_order: { ...EMPTY_DATE_DRAFT },
  work_order: { ...EMPTY_DATE_DRAFT }
};

const EMPTY_DATE_DRAFT_DIRTY_STATE: DateDraftDirtyState = {
  completion_act: { workCompletedAt: false, workStartedAt: false },
  inspection_act: { workCompletedAt: false, workStartedAt: false },
  preliminary_work_order: { workCompletedAt: false, workStartedAt: false },
  work_order: { workCompletedAt: false, workStartedAt: false }
};

function toDateTimeInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 16);
}

function toApiDateTime(value: string) {
  return value.length === 16 ? `${value}:00` : value;
}

export function OrderDocumentsSection({
  mode = "compact",
  onOpenDocument,
  onOpenRegistry,
  orderId,
  selectedDocumentId
}: {
  mode?: "compact" | "full";
  onOpenDocument?: (documentId: number) => void;
  onOpenRegistry?: () => void;
  orderId: number | null;
  selectedDocumentId?: number | null;
}) {
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "danger">("success");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [openingType, setOpeningType] = useState<DocumentType | null>(null);
  const [savingDatesType, setSavingDatesType] = useState<DocumentType | null>(null);
  const [dateDrafts, setDateDrafts] = useState<Record<OrderDocumentType, DateDraft>>(EMPTY_DATE_DRAFTS);
  const [dirtyDateDrafts, setDirtyDateDrafts] = useState<DateDraftDirtyState>(EMPTY_DATE_DRAFT_DIRTY_STATE);
  const canManageDocuments = useCan("orders.documents");
  const documentsQuery = useOrderDocumentsQuery(orderId);
  const ensureMutation = useEnsureOrderDocumentMutation();
  const updateWorkDatesMutation = useUpdateDocumentWorkDatesMutation();
  const orderQuery = useOrderDetailQuery(orderId);
  const documents = documentsQuery.data ?? [];

  const documentItems = useMemo<DocumentCardItem[]>(
    () =>
      documentTypeOptions.map((documentType) => ({
        document: documents.find((item) => item.document_type === documentType) ?? null,
        documentType
      })),
    [documents]
  );

  const orderStartedAt = useMemo(() => {
    const history = orderQuery.data?.status_history ?? [];
    if (history.length === 0) {
      return null;
    }

    return history.reduce<string | null>(
      (earliest, entry) => (earliest === null || entry.changed_at < earliest ? entry.changed_at : earliest),
      null
    );
  }, [orderQuery.data?.status_history]);

  const serverDateDrafts = useMemo<Record<OrderDocumentType, DateDraft>>(
    () => ({
      completion_act: {
        workCompletedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "completion_act")?.work_completed_at ?? orderQuery.data?.completed_at
        ),
        workStartedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "completion_act")?.work_started_at ?? orderStartedAt
        )
      },
      inspection_act: {
        workCompletedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "inspection_act")?.work_completed_at ?? orderQuery.data?.completed_at
        ),
        workStartedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "inspection_act")?.work_started_at ?? orderStartedAt
        )
      },
      preliminary_work_order: {
        workCompletedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "preliminary_work_order")?.work_completed_at ?? orderQuery.data?.completed_at
        ),
        workStartedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "preliminary_work_order")?.work_started_at ?? orderStartedAt
        )
      },
      work_order: {
        workCompletedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "work_order")?.work_completed_at ?? orderQuery.data?.completed_at
        ),
        workStartedAt: toDateTimeInputValue(
          documents.find((item) => item.document_type === "work_order")?.work_started_at ?? orderStartedAt
        )
      }
    }),
    [documents, orderQuery.data?.completed_at, orderStartedAt]
  );

  useEffect(() => {
    setDateDrafts((current) => {
      let hasChanges = false;
      const nextDrafts = { ...current };

      for (const documentType of documentTypeOptions) {
        const mergedDraft: DateDraft = {
          workCompletedAt: dirtyDateDrafts[documentType].workCompletedAt
            ? current[documentType].workCompletedAt
            : serverDateDrafts[documentType].workCompletedAt,
          workStartedAt: dirtyDateDrafts[documentType].workStartedAt
            ? current[documentType].workStartedAt
            : serverDateDrafts[documentType].workStartedAt
        };

        if (
          mergedDraft.workCompletedAt !== current[documentType].workCompletedAt ||
          mergedDraft.workStartedAt !== current[documentType].workStartedAt
        ) {
          nextDrafts[documentType] = mergedDraft;
          hasChanges = true;
        }
      }

      return hasChanges ? nextDrafts : current;
    });
  }, [dirtyDateDrafts, serverDateDrafts]);

  useEffect(() => {
    setDateDrafts(EMPTY_DATE_DRAFTS);
    setDirtyDateDrafts(EMPTY_DATE_DRAFT_DIRTY_STATE);
    setFeedbackMessage(null);
    setFeedbackTone("success");
  }, [orderId]);

  const handleDateDraftChange = (documentType: OrderDocumentType, patch: Partial<DateDraft>) => {
    setDateDrafts((current) => ({
      ...current,
      [documentType]: {
        ...current[documentType],
        ...patch
      }
    }));

    setDirtyDateDrafts((current) => ({
      ...current,
      [documentType]: {
        workCompletedAt:
          patch.workCompletedAt !== undefined
            ? patch.workCompletedAt !== serverDateDrafts[documentType].workCompletedAt
            : current[documentType].workCompletedAt,
        workStartedAt:
          patch.workStartedAt !== undefined
            ? patch.workStartedAt !== serverDateDrafts[documentType].workStartedAt
            : current[documentType].workStartedAt
      }
    }));
  };

  const handleDownload = async (item: DocumentCardItem, format: "docx" | "pdf") => {
    if (!orderId) {
      return;
    }

    try {
      const key = `${item.document?.id ?? item.documentType}:${format}`;
      setDownloadingKey(key);

      const requestPath = item.document
        ? `/documents/${item.document.id}/download/${format}`
        : format === "pdf"
          ? downloadOrderDocumentPdfRequestPath(orderId, item.documentType)
          : downloadOrderDocumentDocxRequestPath(orderId, item.documentType);

      const preferredFilename =
        format === "pdf" ? (item.document?.pdf_file.filename ?? null) : (item.document?.docx_file.filename ?? null);

      await downloadFile(requestPath, preferredFilename, item.document ? undefined : { method: "POST" });
      await documentsQuery.refetch();
      setFeedbackTone("success");
      setFeedbackMessage(format === "pdf" ? "PDF обновлён и скачан" : "DOCX обновлён и скачан");
    } catch (error) {
      setFeedbackTone("danger");
      setFeedbackMessage(error instanceof Error ? error.message : "Не удалось скачать файл");
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleOpen = async (item: DocumentCardItem) => {
    if (!orderId || !onOpenDocument) {
      return;
    }

    try {
      setOpeningType(item.documentType);
      const ensured =
        item.document ??
        (await ensureMutation.mutateAsync({
          documentType: item.documentType,
          orderId
        }));
      onOpenDocument(ensured.id);
    } finally {
      setOpeningType(null);
    }
  };

  const saveDatesForDocumentType = async (documentType: OrderDocumentType) => {
    if (!orderId) {
      return;
    }

    const draft = dateDrafts[documentType];
    if (!draft.workStartedAt) {
      return;
    }

    try {
      setSavingDatesType(documentType);

      const item = documentItems.find((documentItem) => documentItem.documentType === documentType);
      const ensured =
        item?.document ??
        (await ensureMutation.mutateAsync({
          documentType,
          orderId
        }));

      await updateWorkDatesMutation.mutateAsync({
        documentId: ensured.id,
        payload: {
          work_completed_at: draft.workCompletedAt ? toApiDateTime(draft.workCompletedAt) : null,
          work_started_at: toApiDateTime(draft.workStartedAt)
        }
      });

      await documentsQuery.refetch();
      setDirtyDateDrafts((current) => ({
        ...current,
        [documentType]: {
          workCompletedAt: false,
          workStartedAt: false
        }
      }));
      setFeedbackMessage("Даты документа сохранены");
    } finally {
      setSavingDatesType(null);
    }
  };

  useEffect(() => {
    if (!orderId) {
      return;
    }

    const timeouts = documentTypeOptions
      .filter((documentType) => {
        const hasDirtyFields =
          dirtyDateDrafts[documentType].workCompletedAt || dirtyDateDrafts[documentType].workStartedAt;

        return hasDirtyFields && Boolean(dateDrafts[documentType].workStartedAt) && savingDatesType !== documentType;
      })
      .map((documentType) =>
        window.setTimeout(() => {
          void saveDatesForDocumentType(documentType);
        }, 500)
      );

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [dateDrafts, dirtyDateDrafts, orderId, savingDatesType]);

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      {onOpenRegistry ? (
        <div className="mb-5 flex justify-end">
          <AppButton size="sm" type="button" variant="outline" onClick={onOpenRegistry}>
            <ExternalLink className="h-4 w-4" />
            Реестр
          </AppButton>
        </div>
      ) : null}

      {!orderId ? (
        <EmptyState title="Заказ не выбран" description="Откройте заказ из списка, чтобы работать с его документами прямо в CRM." />
      ) : null}

      {orderId && documentsQuery.isLoading ? (
        <LoadingState title="Загружаем документы" description="Подготавливаем карточки документов по текущему заказу." />
      ) : null}

      {orderId && documentsQuery.isError ? (
        <ErrorState
          title="Не удалось загрузить документы"
          description="Список документов не ответил. Попробуйте обновить секцию."
          actionLabel="Повторить"
          onAction={() => void documentsQuery.refetch()}
        />
      ) : null}

      {orderId && !documentsQuery.isLoading && !documentsQuery.isError ? (
        <>
          <div className="space-y-3">
            {documentItems.map((item) => (
              <article
                key={item.documentType}
                className={mode === "full" && item.document && selectedDocumentId === item.document.id
                  ? "rounded-2xl border border-accent bg-accent-muted/30 px-4 py-4"
                  : "rounded-2xl border border-border bg-surface px-4 py-4"}
              >
                <div
                  className={mode === "full"
                    ? "grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px_220px_auto] xl:items-start"
                    : "grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px_220px] xl:items-start"}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{DOCUMENT_TYPE_LABELS[item.documentType]}</p>
                  </div>

                  <div className="block min-w-0">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Дата начала работ
                    </span>
                    <AppInput
                      type="datetime-local"
                      value={dateDrafts[item.documentType].workStartedAt}
                      onFocus={() => { if (!dateDrafts[item.documentType].workStartedAt) handleDateDraftChange(item.documentType, { workStartedAt: getDefaultDateTimeValue() }); }}
                      onChange={(event) => handleDateDraftChange(item.documentType, { workStartedAt: event.target.value })}
                    />
                  </div>

                  <div className="block min-w-0">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Дата окончания работ
                    </span>
                    <AppInput
                      type="datetime-local"
                      value={dateDrafts[item.documentType].workCompletedAt}
                      onFocus={() => { if (!dateDrafts[item.documentType].workCompletedAt) handleDateDraftChange(item.documentType, { workCompletedAt: getDefaultDateTimeValue() }); }}
                      onChange={(event) => handleDateDraftChange(item.documentType, { workCompletedAt: event.target.value })}
                    />
                  </div>

                  {mode === "full" && onOpenDocument && canManageDocuments ? (
                    <div className="flex items-start justify-end xl:justify-end">
                      <AppButton size="sm" variant="outline" disabled={openingType === item.documentType} onClick={() => void handleOpen(item)}>
                        <FileText className="h-4 w-4" />
                        {openingType === item.documentType ? "Открываем..." : "Открыть"}
                      </AppButton>
                    </div>
                  ) : null}

                </div>

                {canManageDocuments ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <AppButton
                      size="sm"
                      variant="ghost"
                      disabled={downloadingKey === `${item.document?.id ?? item.documentType}:docx`}
                      onClick={() => void handleDownload(item, "docx")}
                    >
                      <FileDown className="h-4 w-4" />
                      {downloadingKey === `${item.document?.id ?? item.documentType}:docx` ? "Скачиваем..." : "Скачать DOCX"}
                    </AppButton>
                    <AppButton
                      size="sm"
                      variant="ghost"
                      disabled={downloadingKey === `${item.document?.id ?? item.documentType}:pdf`}
                      onClick={() => void handleDownload(item, "pdf")}
                    >
                      <FileDown className="h-4 w-4" />
                      {downloadingKey === `${item.document?.id ?? item.documentType}:pdf` ? "Скачиваем..." : "Скачать PDF"}
                    </AppButton>
                  </div>
                ) : null}

                  {savingDatesType === item.documentType ? (
                    <p className="mt-3 text-xs text-muted-foreground">Сохраняем даты...</p>
                  ) : dirtyDateDrafts[item.documentType].workCompletedAt || dirtyDateDrafts[item.documentType].workStartedAt ? (
                    <p className="mt-3 text-xs text-muted-foreground">Изменения сохранятся автоматически</p>
                  ) : null}
	              </article>
	            ))}
          </div>

          {feedbackMessage ? (
            <div
              className={cn(
                "mt-4 rounded-2xl px-4 py-3 text-sm",
                feedbackTone === "danger"
                  ? "border border-danger/20 bg-danger/10 text-danger"
                  : "border border-success/20 bg-success/10 text-success"
              )}
            >
              {feedbackMessage}
            </div>
          ) : null}

          {ensureMutation.isError ? (
            <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {ensureMutation.error?.message}
            </div>
          ) : null}

          {updateWorkDatesMutation.isError ? (
            <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {updateWorkDatesMutation.error?.message}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
