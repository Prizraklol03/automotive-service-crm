import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";

import {
  downloadFinanceExpenseAttachment,
  useDeleteFinanceExpenseAttachmentMutation,
  useFinanceExpenseAttachmentsQuery,
  useUploadFinanceExpenseAttachmentMutation
} from "@/features/finance/api/finance-hooks";
import type { FinanceExpenseAttachment } from "@/entities/finance/model/types";
import { formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";

export function FinanceExpenseAttachmentsSection({
  canManage,
  expenseId
}: {
  canManage: boolean;
  expenseId: number | null;
}) {
  const attachmentsQuery = useFinanceExpenseAttachmentsQuery(expenseId);
  const uploadAttachmentMutation = useUploadFinanceExpenseAttachmentMutation();
  const deleteAttachmentMutation = useDeleteFinanceExpenseAttachmentMutation();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<number | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const openAttachmentPicker = () => {
    attachmentInputRef.current?.click();
  };

  const clearSelectedAttachment = () => {
    setSelectedAttachmentFile(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  useEffect(() => {
    clearSelectedAttachment();
    setAttachmentError(null);
    setPendingDeleteAttachmentId(null);
  }, [expenseId]);

  if (!expenseId) {
    return null;
  }

  const attachments = attachmentsQuery.data ?? [];

  const handleAttachmentSelection = (file: File | null) => {
    setSelectedAttachmentFile(file);
    setAttachmentError(null);
  };

  const handleAttachmentUpload = async (file: File | null) => {
    if (!expenseId || !file) {
      return;
    }

    setAttachmentError(null);
    try {
      await uploadAttachmentMutation.mutateAsync({ expenseId, file });
      clearSelectedAttachment();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Не удалось загрузить вложение");
    }
  };

  const handleAttachmentDownload = async (attachment: FinanceExpenseAttachment, viewOnly = false) => {
    const result = await downloadFinanceExpenseAttachment(expenseId, attachment.id);
    const url = URL.createObjectURL(result.blob);

    if (viewOnly) {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename ?? attachment.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Вложения</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{attachments.length} шт.</p>
        </div>
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <input
          ref={attachmentInputRef}
          className="hidden"
          type="file"
          onChange={(event) => handleAttachmentSelection(event.target.files?.[0] ?? null)}
        />

        {canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <AppButton
              type="button"
              variant="outline"
              onClick={openAttachmentPicker}
              disabled={uploadAttachmentMutation.isPending}
            >
              <Paperclip className="h-4 w-4" />
              Прикрепить файл
            </AppButton>

            {selectedAttachmentFile ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <p className="min-w-0 truncate text-sm text-foreground">{selectedAttachmentFile.name}</p>
                <AppButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSelectedAttachment}
                  disabled={uploadAttachmentMutation.isPending}
                >
                  Очистить
                </AppButton>
              </div>
            ) : null}

            <AppButton
              type="button"
              disabled={!selectedAttachmentFile || uploadAttachmentMutation.isPending}
              onClick={() => void handleAttachmentUpload(selectedAttachmentFile)}
            >
              {uploadAttachmentMutation.isPending ? "Загружаем..." : "Загрузить"}
            </AppButton>
          </div>
        ) : null}

        {attachmentError ? <p className="text-xs text-danger">{attachmentError}</p> : null}
        {uploadAttachmentMutation.isPending ? <p className="text-xs text-muted-foreground">Загружаем вложение...</p> : null}

        {attachmentsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Загружаем вложения...</p>
        ) : attachmentsQuery.isError ? (
          <div className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
            <p>Не удалось загрузить вложения.</p>
            <AppButton
              className="mt-3"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void attachmentsQuery.refetch()}
            >
              Повторить
            </AppButton>
          </div>
        ) : attachments.length ? (
          <div className="space-y-2">
            {attachments.map((attachment) => {
              const isImage = attachment.mime_type.startsWith("image/");
              const isPdf = attachment.mime_type === "application/pdf";
              const isDeleting = pendingDeleteAttachmentId === attachment.id && deleteAttachmentMutation.isPending;
              return (
                <div key={attachment.id} className="rounded-xl border border-border/80 bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isImage ? (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <p className="truncate text-sm font-medium text-foreground">{attachment.file_name}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(attachment.created_at)} · {formatAttachmentSize(attachment.size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <AppButton
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => void handleAttachmentDownload(attachment, true)}
                        disabled={!isImage && !isPdf}
                      >
                        Просмотр
                      </AppButton>
                      <AppButton
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => void handleAttachmentDownload(attachment, false)}
                      >
                        Скачать
                      </AppButton>
                      {canManage ? (
                        <AppButton
                          size="sm"
                          type="button"
                          variant="ghost"
                          disabled={deleteAttachmentMutation.isPending}
                          onClick={async () => {
                            if (!window.confirm("Удалить вложение?")) {
                              return;
                            }
                            setPendingDeleteAttachmentId(attachment.id);
                            setAttachmentError(null);
                            try {
                              await deleteAttachmentMutation.mutateAsync({ attachmentId: attachment.id, expenseId });
                            } catch (error) {
                              setAttachmentError(error instanceof Error ? error.message : "Не удалось удалить вложение");
                            } finally {
                              setPendingDeleteAttachmentId(null);
                            }
                          }}
                        >
                          {isDeleting ? "Удаляем..." : "Удалить"}
                        </AppButton>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Пока нет вложений.
          </div>
        )}
      </div>
    </section>
  );
}

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
