import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Check,
  Eye,
  History,
  Lock,
  Loader2,
  MessageSquare,
  MoveLeft,
  OctagonMinus,
  PenLine,
  RefreshCcw,
  ScanLine,
  Sparkles,
  SquareDashedMousePointer,
  X,
} from "lucide-react";

import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  useCompleteInspectionSessionMutation,
  useConfirmInspectionSessionMutation,
  useCurrentInspectionSessionQuery,
  useDeleteInspectionGeneralPhotoMutation,
  useDeleteInspectionMarkMutation,
  useGenerateInspectionActMutation,
  useInspectionGeneralPhotoObjectUrl,
  useInspectionHistoryQuery,
  useLockInspectionSessionMutation,
  useReopenInspectionSessionMutation,
  useUpdateInspectionMarkMutation,
  useUpdateInspectionSessionMutation,
  useUploadInspectionGeneralPhotosMutation,
  useCreateInspectionMarkMutation,
} from "@/features/inspection/api/inspection-hooks";
import { createDefaultInspectionChecklist, INSPECTION_CHECKLIST_DEFINITIONS } from "@/features/inspection/model/checklist";
import type { InspectionMark, InspectionMarkPayload, InspectionPoint } from "@/features/inspection/model/types";
import {
  INSPECTION_DEFECT_LABELS,
  INSPECTION_MARK_STATUS_LABELS,
  INSPECTION_SEVERITY_LABELS,
  INSPECTION_STATUS_LABELS,
  INSPECTION_VIEW_LABELS,
  INSPECTION_VIEW_ORDER,
  type InspectionGeometryType,
  type InspectionSession,
  type InspectionSessionStatus,
} from "@/features/inspection/model/types";
import {
  canDeleteInspectionVertex,
  canUndoInspectionGeometry,
  deleteInspectionVertex,
  InspectionCanvas,
  type EditableGeometryState,
  type InspectionCanvasTool,
} from "@/features/inspection/ui/inspection-canvas";
import { InspectionMarkSheet } from "@/features/inspection/ui/inspection-mark-sheet";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { AppTextarea } from "@/shared/ui/app-textarea";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

function statusTone(status: InspectionSessionStatus) {
  if (status === "completed" || status === "confirmed") return "success" as const;
  if (status === "locked") return "muted" as const;
  if (status === "in_progress") return "accent" as const;
  return "warning" as const;
}

function sessionStatusDescription(session: InspectionSession) {
  if (session.status === "locked") {
    return "Осмотр заблокирован и доступен только для просмотра.";
  }
  if (session.status === "confirmed") {
    return "Осмотр подтверждён и доступен только для просмотра.";
  }
  if (session.status === "completed") {
    return "Осмотр завершён. Можно сформировать акт, подтвердить или заблокировать.";
  }
  if (session.status === "in_progress") {
    return "Осмотр в работе. Изменения сохраняются в черновик автоматически.";
  }
  return "Черновик осмотра. Отмечайте дефекты, фото и чек-лист.";
}

function GeneralPhotoThumb({
  canDelete,
  sessionId,
  photoId,
  isDeleting,
  onDelete,
}: {
  canDelete: boolean;
  sessionId: number;
  photoId: number;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const { data, isPending } = useInspectionGeneralPhotoObjectUrl(sessionId, photoId);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface-2">
      {data ? (
        <img alt="" className="h-28 w-full object-cover" src={data} />
      ) : (
        <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
          {isPending ? "Загрузка..." : "Нет превью"}
        </div>
      )}
      <button
        aria-label="Удалить фото"
        className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white transition hover:bg-black"
        disabled={!canDelete || isDeleting}
        onClick={onDelete}
        type="button"
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </button>
    </div>
  );
}

type EditableDraft = InspectionMarkPayload & { id?: number; photos?: InspectionMark["photos"] };

function createMarkDraft(
  geometryType: InspectionGeometryType,
  points: InspectionPoint[],
  viewType: InspectionMarkPayload["view_type"],
): EditableDraft {
  return {
    comment: "",
    defect_type: "scratch",
    geometry_data: { points },
    geometry_type: geometryType,
    severity: "medium",
    status: "existing_before_work",
    view_type: viewType,
    zone_key: null,
  };
}

export function InspectionEditor({
  isMobile,
  isOpen,
  onClose,
  orderId,
  orderLabel,
  vehicleLabel,
}: {
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderLabel: string;
  vehicleLabel: string;
}) {
  const roleCode = useAuthStore((state) => state.user?.role_code);
  const navigate = useNavigate();
  const sessionQuery = useCurrentInspectionSessionQuery(isOpen ? orderId : null);
  const session = sessionQuery.data;
  const sessionId = session?.id ?? null;
  const historyQuery = useInspectionHistoryQuery(sessionId);
  const createMarkMutation = useCreateInspectionMarkMutation(orderId, sessionId ?? 0);
  const updateMarkMutation = useUpdateInspectionMarkMutation(orderId, sessionId ?? 0);
  const deleteMarkMutation = useDeleteInspectionMarkMutation(orderId, sessionId ?? 0);
  const updateSessionMutation = useUpdateInspectionSessionMutation(orderId, sessionId ?? 0);
  const uploadGeneralPhotosMutation = useUploadInspectionGeneralPhotosMutation(orderId, sessionId ?? 0);
  const deleteGeneralPhotoMutation = useDeleteInspectionGeneralPhotoMutation(orderId, sessionId ?? 0);
  const completeSessionMutation = useCompleteInspectionSessionMutation(orderId, sessionId ?? 0);
  const confirmSessionMutation = useConfirmInspectionSessionMutation(orderId, sessionId ?? 0);
  const lockSessionMutation = useLockInspectionSessionMutation(orderId, sessionId ?? 0);
  const reopenSessionMutation = useReopenInspectionSessionMutation(orderId, sessionId ?? 0);
  const generateActMutation = useGenerateInspectionActMutation(orderId, sessionId ?? 0);

  const [currentView, setCurrentView] = useState<typeof INSPECTION_VIEW_ORDER[number]>("front");
  const [tool, setTool] = useState<InspectionCanvasTool>("view");
  const [draftPoints, setDraftPoints] = useState<InspectionPoint[]>([]);
  const [activeMarkId, setActiveMarkId] = useState<number | null>(null);
  const [markSheetDraft, setMarkSheetDraft] = useState<EditableDraft | null>(null);
  const [geometryHistory, setGeometryHistory] = useState<InspectionPoint[][]>([]);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [generalComment, setGeneralComment] = useState("");
  const [checklist, setChecklist] = useState(createDefaultInspectionChecklist());
  const [sessionSaveMessage, setSessionSaveMessage] = useState<string | null>(null);
  const generalPhotosInputRef = useRef<HTMLInputElement | null>(null);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);
  const canEdit = session ? !["completed", "confirmed", "locked"].includes(session.status) : false;
  const isReadonly = session ? ["confirmed", "locked"].includes(session.status) : false;
  const canConfirm = session?.status === "completed";
  const canLock = session ? ["completed", "confirmed"].includes(session.status) : false;
  const canReopen = roleCode === "admin" && Boolean(session && ["completed", "confirmed", "locked"].includes(session.status));
  const canGenerateAct = Boolean(session && ["completed", "confirmed", "locked"].includes(session.status));

  useEffect(() => {
    const hasUnsavedShape = draftPoints.length > 0;
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedShape) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftPoints.length]);

  useEffect(() => {
    if (!session) {
      return;
    }
    setGeneralComment(session.general_comment ?? "");
    setChecklist(() => {
      const defaults = createDefaultInspectionChecklist();
      const serverChecklist = session.checklist_json ?? {};
      return Object.entries(defaults).reduce<typeof defaults>((acc, [key, value]) => {
        const serverValue = serverChecklist[key] as { checked?: boolean; label?: string; note?: string } | undefined;
        acc[key] = {
          checked: serverValue?.checked ?? value.checked,
          label: serverValue?.label ?? value.label,
          note: serverValue?.note ?? value.note,
        };
        return acc;
      }, {} as typeof defaults);
    });
  }, [session?.id, session?.updated_at]);

  useEffect(() => {
    if (!markSheetDraft?.id) {
      setGeometryHistory([]);
      setSelectedVertexIndex(null);
      return;
    }
    setGeometryHistory([markSheetDraft.geometry_data.points]);
    setSelectedVertexIndex(null);
  }, [markSheetDraft?.id]);

  useEffect(() => {
    if (!sessionId || !session || !canEdit) {
      return;
    }

    const currentChecklist = JSON.stringify(session.checklist_json ?? createDefaultInspectionChecklist());
    const localChecklist = JSON.stringify(checklist);
    const commentChanged = (session.general_comment ?? "") !== generalComment;
    const checklistChanged = currentChecklist !== localChecklist;
    if (!commentChanged && !checklistChanged) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void updateSessionMutation
        .mutateAsync({
          general_comment: generalComment,
          checklist_json: checklist,
          status: session.status === "draft" ? "in_progress" : undefined,
        })
        .then(() => setSessionSaveMessage("Осмотр сохранён"))
        .catch(() => setSessionSaveMessage("Не удалось сохранить изменения"));
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [canEdit, checklist, generalComment, session, sessionId, updateSessionMutation]);

  const marks = session?.marks ?? [];
  const activeViewMarks = useMemo(
    () => marks.filter((mark) => mark.view_type === currentView).sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [currentView, marks],
  );
  const editingGeometry: EditableGeometryState | null =
    markSheetDraft?.id != null
      ? {
          geometryType: markSheetDraft.geometry_type,
          points: markSheetDraft.geometry_data.points,
          severity: markSheetDraft.severity,
          viewType: markSheetDraft.view_type,
        }
      : null;
  const showGeometryToolbar = canEdit && Boolean(markSheetDraft?.id && activeMarkId === markSheetDraft.id);
  const canDeleteVertexFromGeometry = Boolean(
    markSheetDraft &&
      canDeleteInspectionVertex(markSheetDraft.geometry_type, markSheetDraft.geometry_data.points, selectedVertexIndex),
  );
  const canUndoGeometry = canUndoInspectionGeometry(geometryHistory);

  const finishDraftShape = () => {
    if (tool === "polygon" && draftPoints.length >= 3) {
      setMarkSheetDraft(createMarkDraft("polygon", draftPoints, currentView));
      setDraftPoints([]);
      setTool("view");
    }
  };

  const handleEditingGeometryChange = (nextPoints: InspectionPoint[], options?: { commitHistory?: boolean }) => {
    setMarkSheetDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        geometry_data: { points: nextPoints },
      };
    });

    if (options?.commitHistory !== false) {
      setGeometryHistory((current) => {
        const last = current[current.length - 1];
        if (last && JSON.stringify(last) === JSON.stringify(nextPoints)) {
          return current;
        }
        return [...current, nextPoints];
      });
    }
  };

  const handleUndoGeometry = () => {
    setGeometryHistory((current) => {
      if (current.length <= 1) {
        return current;
      }
      const nextHistory = current.slice(0, -1);
      const previous = nextHistory[nextHistory.length - 1];
      if (previous) {
        setMarkSheetDraft((draft) => (draft ? { ...draft, geometry_data: { points: previous } } : draft));
      }
      setSelectedVertexIndex(null);
      return nextHistory;
    });
  };

  const handleCancelGeometryEditing = () => {
    const initialPoints = geometryHistory[0];
    if (!initialPoints) {
      return;
    }
    setMarkSheetDraft((draft) => (draft ? { ...draft, geometry_data: { points: initialPoints } } : draft));
    setGeometryHistory([initialPoints]);
    setSelectedVertexIndex(null);
  };

  const handleDeleteSelectedVertex = () => {
    if (!markSheetDraft) {
      return;
    }
    const nextPoints = deleteInspectionVertex(markSheetDraft.geometry_data.points, selectedVertexIndex);
    if (nextPoints.length === markSheetDraft.geometry_data.points.length) {
      return;
    }
    handleEditingGeometryChange(nextPoints, { commitHistory: true });
    setSelectedVertexIndex(null);
  };

  const handleCanvasTap = (point: InspectionPoint) => {
    if (!canEdit) {
      return;
    }
    if (tool === "point") {
      setMarkSheetDraft(createMarkDraft("point", [point], currentView));
      setTool("view");
      return;
    }
    if (tool === "line") {
      const nextPoints = [...draftPoints, point];
      if (nextPoints.length >= 2) {
        setMarkSheetDraft(createMarkDraft("line", nextPoints.slice(0, 2), currentView));
        setDraftPoints([]);
        setTool("view");
      } else {
        setDraftPoints(nextPoints);
      }
      return;
    }
    if (tool === "polygon") {
      setDraftPoints((current) => [...current, point]);
    }
  };

  const handleSelectExistingMark = (markId: number) => {
    setActiveMarkId(markId);
    setTool("view");
    const selected = marks.find((mark) => mark.id === markId);
    if (!selected) {
      return;
    }
    setCurrentView(selected.view_type);
    setSelectedVertexIndex(null);
    setMarkSheetDraft({
      id: selected.id,
      comment: selected.comment ?? "",
      defect_type: selected.defect_type,
      geometry_data: selected.geometry_data,
      geometry_type: selected.geometry_type,
      photos: selected.photos,
      severity: selected.severity,
      status: selected.status,
      view_type: selected.view_type,
      zone_key: selected.zone_key,
    });
  };

  const handleSaveMark = async (payload: EditableDraft) => {
    if (!sessionId) {
      return null;
    }
    const requestPayload: InspectionMarkPayload = {
      comment: payload.comment,
      defect_type: payload.defect_type,
      geometry_data: payload.geometry_data,
      geometry_type: payload.geometry_type,
      severity: payload.severity,
      status: payload.status,
      view_type: payload.view_type,
      zone_key: payload.zone_key,
    };
    const saved = payload.id
      ? await updateMarkMutation.mutateAsync({ markId: payload.id, payload: requestPayload })
      : await createMarkMutation.mutateAsync(requestPayload);
    setActiveMarkId(saved.id);
    setMarkSheetDraft({
      id: saved.id,
      comment: saved.comment ?? "",
      defect_type: saved.defect_type,
      geometry_data: saved.geometry_data,
      geometry_type: saved.geometry_type,
      photos: saved.photos,
      severity: saved.severity,
      status: saved.status,
      view_type: saved.view_type,
      zone_key: saved.zone_key,
    });
    return saved;
  };

  const handleDeleteMark = async (markId: number) => {
    await deleteMarkMutation.mutateAsync(markId);
    setActiveMarkId(null);
    setMarkSheetDraft(null);
  };

  const handleUploadGeneralPhotos = async (files: FileList | null) => {
    if (!files?.length || !sessionId) {
      return;
    }
    await uploadGeneralPhotosMutation.mutateAsync(Array.from(files));
  };

  const header = (
    <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Осмотр автомобиля</div>
        <div className="mt-1 text-lg font-semibold">{orderLabel}</div>
        <div className="mt-1 text-sm text-muted-foreground">{vehicleLabel}</div>
        {session ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge label={INSPECTION_STATUS_LABELS[session.status]} tone={statusTone(session.status)} />
            {session.snapshot_version > 1 ? <StatusBadge label="Переоткрыт" tone="warning" /> : null}
            {isReadonly ? <StatusBadge label="Только просмотр" tone="muted" /> : null}
            <span className="text-xs text-muted-foreground">
              Начат: {formatDateTime(session.started_at) ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              Отметок: {session.marks_count} · Фото: {session.mark_photos_count + session.general_photos_count}
            </span>
          </div>
        ) : null}
        {session ? <div className="mt-2 text-xs text-muted-foreground">{sessionStatusDescription(session)}</div> : null}
        </div>
        <AppButton
          aria-label="Закрыть осмотр"
          onClick={() => {
            if (draftPoints.length > 0 && !window.confirm("Закрыть редактор и потерять незавершённую фигуру?")) {
              return;
            }
            onClose();
          }}
          size="icon"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </AppButton>
      </div>
  );

  const editorBody = (
    <div className="app-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-4 sm:px-5">
      {sessionQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-surface px-5 py-8 text-sm text-muted-foreground">
          Загружаем осмотр...
        </div>
      ) : null}

      {!sessionQuery.isLoading && !session ? (
        <div className="rounded-3xl border border-border bg-surface px-5 py-8 text-sm text-muted-foreground">
          Осмотр ещё не создан.
        </div>
      ) : null}

      {session ? (
        <div className="space-y-5">
          <section className="overflow-x-auto">
            <div className="flex gap-2">
              {INSPECTION_VIEW_ORDER.map((view) => (
                <AppButton
                  key={view}
                  onClick={() => setCurrentView(view)}
                  size="sm"
                  variant={currentView === view ? "default" : "ghost"}
                >
                  {INSPECTION_VIEW_LABELS[view]}
                </AppButton>
              ))}
            </div>
          </section>

          <InspectionCanvas
            activeMarkId={activeMarkId}
            canEdit={canEdit}
            currentView={currentView}
            draftPoints={draftPoints}
            editingGeometry={editingGeometry}
            editingMarkId={markSheetDraft?.id ?? null}
            marks={marks}
            onCanvasTap={handleCanvasTap}
            onChangeEditingGeometry={handleEditingGeometryChange}
            onSelectMark={handleSelectExistingMark}
            onSelectVertex={setSelectedVertexIndex}
            selectedVertexIndex={selectedVertexIndex}
            tool={tool}
          />

          <section className="rounded-3xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Отметки на проекции</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Выберите дефект из списка или создайте новую отметку на схеме.
                </div>
              </div>
            </div>

            {activeViewMarks.length ? (
              <div className="mt-4 space-y-3">
                {activeViewMarks.map((mark, index) => (
                  <button
                    key={mark.id}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition",
                      activeMarkId === mark.id
                        ? "border-accent bg-accent/10"
                        : "border-border/80 bg-surface-2 hover:border-border",
                    )}
                    onClick={() => handleSelectExistingMark(mark.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        #{index + 1} · {INSPECTION_DEFECT_LABELS[mark.defect_type]}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {INSPECTION_SEVERITY_LABELS[mark.severity]} · {INSPECTION_MARK_STATUS_LABELS[mark.status]}
                      </div>
                      {mark.comment ? <div className="mt-2 text-sm text-foreground/90">{mark.comment}</div> : null}
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">{mark.photos.length} фото</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Для этой проекции пока нет отметок.
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Общие фото автомобиля</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Это фотографии всего автомобиля, не привязанные к конкретной отметке.
                </div>
              </div>
              <label className="inline-flex">
                <input
                  accept="image/*"
                  className="hidden"
                  multiple
                  onChange={(event) => void handleUploadGeneralPhotos(event.target.files)}
                  ref={generalPhotosInputRef}
                  type="file"
                />
                <AppButton disabled={!canEdit || uploadGeneralPhotosMutation.isPending} size="sm" variant="outline" asChild>
                  <span>
                    {uploadGeneralPhotosMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Добавить фото
                  </span>
                </AppButton>
              </label>
            </div>

            {session.general_photos.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {session.general_photos.map((photo) => (
                  <GeneralPhotoThumb
                    canDelete={canEdit}
                    key={photo.id}
                    sessionId={session.id}
                    isDeleting={deleteGeneralPhotoMutation.isPending}
                    onDelete={() => void deleteGeneralPhotoMutation.mutateAsync(photo.id)}
                    photoId={photo.id}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Пока без общих фотографий.
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold">Чек-лист осмотра</div>
            <div className="mt-4 grid gap-3">
              {INSPECTION_CHECKLIST_DEFINITIONS.map((item) => {
                const value = checklist[item.key];
                return (
                  <div key={item.key} className="rounded-2xl border border-border/80 bg-surface-2 p-3">
                    <label className="flex items-start gap-3">
                      <input
                        checked={value?.checked ?? false}
                        className="mt-1 h-4 w-4 rounded border-border bg-surface"
                        disabled={!canEdit}
                        onChange={(event) =>
                          setChecklist((current) => ({
                            ...current,
                            [item.key]: {
                              ...(current[item.key] ?? { checked: false, label: item.label, note: "" }),
                              checked: event.target.checked,
                              label: item.label,
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.noteLabel ? (
                          <AppTextarea
                            className="mt-3 min-h-20"
                            disabled={!canEdit}
                            placeholder={item.noteLabel}
                            value={value?.note ?? ""}
                            onChange={(event) =>
                              setChecklist((current) => ({
                                ...current,
                                [item.key]: {
                                  ...(current[item.key] ?? { checked: false, label: item.label, note: "" }),
                                  checked: current[item.key]?.checked ?? false,
                                  label: item.label,
                                  note: event.target.value,
                                },
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold">Общий комментарий</div>
            <AppTextarea
              ref={commentRef}
              className="mt-4 min-h-28"
              disabled={!canEdit}
              placeholder="Зафиксируйте общее состояние автомобиля, важные замечания и договорённости."
              value={generalComment}
              onChange={(event) => setGeneralComment(event.target.value)}
            />
            {sessionSaveMessage ? <div className="mt-3 text-xs text-muted-foreground">{sessionSaveMessage}</div> : null}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-4">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold">История осмотра</div>
            </div>
            {historyQuery.data?.items?.length ? (
              <div className="space-y-3">
                {historyQuery.data.items.slice(-10).reverse().map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border/80 bg-surface-2 px-3 py-3">
                    <div className="text-sm font-medium">{item.title}</div>
                    {item.description ? <div className="mt-1 text-xs text-muted-foreground">{item.description}</div> : null}
                    <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.created_at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                История появится после первых действий в осмотре.
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );

  const bottomBar = session ? (
    <div className="fixed inset-x-0 bottom-0 z-[430] border-t border-border bg-background/95 px-3 py-3 backdrop-blur lg:left-auto lg:right-0 lg:w-[min(980px,calc(100vw-2rem))]">
      {canEdit && draftPoints.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <AppButton className="min-h-11" onClick={() => setDraftPoints((current) => current.slice(0, -1))} size="sm" variant="outline">
            <MoveLeft className="h-4 w-4" />
            Отменить точку
          </AppButton>
          {tool === "polygon" ? (
            <AppButton className="min-h-11" disabled={draftPoints.length < 3} onClick={finishDraftShape} size="sm">
              <Check className="h-4 w-4" />
              Сохранить контур
            </AppButton>
          ) : null}
          <AppButton
            className="min-h-11"
            onClick={() => {
              setDraftPoints([]);
              setTool("view");
            }}
            size="sm"
            variant="ghost"
          >
            Отмена
          </AppButton>
        </div>
      ) : canEdit ? (
        <div className="flex flex-wrap gap-2">
          <AppButton className="min-h-11" onClick={() => setTool((current) => (current === "point" ? "view" : "point"))} size="sm" variant={tool === "point" ? "default" : "outline"}>
            <SquareDashedMousePointer className="h-4 w-4" />
            Точка
          </AppButton>
          <AppButton className="min-h-11" onClick={() => setTool((current) => (current === "line" ? "view" : "line"))} size="sm" variant={tool === "line" ? "default" : "outline"}>
            <ScanLine className="h-4 w-4" />
            Линия
          </AppButton>
          <AppButton className="min-h-11" onClick={() => setTool((current) => (current === "polygon" ? "view" : "polygon"))} size="sm" variant={tool === "polygon" ? "default" : "outline"}>
            <PenLine className="h-4 w-4" />
            Область
          </AppButton>
          {showGeometryToolbar ? (
            <>
              <AppButton className="min-h-11" disabled={!canUndoGeometry} onClick={handleUndoGeometry} size="sm" variant="outline">
                <RefreshCcw className="h-4 w-4" />
                Отменить
              </AppButton>
              <AppButton className="min-h-11" disabled={!canDeleteVertexFromGeometry} onClick={handleDeleteSelectedVertex} size="sm" variant="outline">
                <X className="h-4 w-4" />
                Удалить вершину
              </AppButton>
              <AppButton className="min-h-11" onClick={handleCancelGeometryEditing} size="sm" variant="ghost">
                Сбросить геометрию
              </AppButton>
            </>
          ) : null}
          <AppButton className="min-h-11" onClick={() => generalPhotosInputRef.current?.click()} size="sm" variant="outline">
            <Camera className="h-4 w-4" />
            Фото
          </AppButton>
          <AppButton
            className="min-h-11"
            onClick={() => commentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            size="sm"
            variant="outline"
          >
            <MessageSquare className="h-4 w-4" />
            Комментарий
          </AppButton>
          <AppButton
            className="min-h-11"
            disabled={completeSessionMutation.isPending}
            onClick={() => {
              if (!sessionId) return;
              void completeSessionMutation.mutateAsync();
            }}
            size="sm"
          >
            {completeSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Завершить осмотр
          </AppButton>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AppButton
            className="min-h-11"
            disabled={!canGenerateAct || generateActMutation.isPending}
            onClick={() => void generateActMutation.mutateAsync()}
            size="sm"
          >
            {generateActMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Сформировать акт
          </AppButton>
          {session.latest_export?.document_id ? (
            <AppButton
              className="min-h-11"
              onClick={() => {
                navigate(`/documents?order=${orderId}&document=${session.latest_export?.document_id}`);
              }}
              size="sm"
              variant="outline"
            >
              <Eye className="h-4 w-4" />
              Открыть акт
            </AppButton>
          ) : null}
          <AppButton
            className="min-h-11"
            disabled={!canConfirm || confirmSessionMutation.isPending}
            onClick={() => void confirmSessionMutation.mutateAsync()}
            size="sm"
            variant="outline"
          >
            {confirmSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Подтвердить
          </AppButton>
          <AppButton
            className="min-h-11"
            disabled={!canLock || lockSessionMutation.isPending}
            onClick={() => void lockSessionMutation.mutateAsync()}
            size="sm"
            variant="outline"
          >
            {lockSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Заблокировать
          </AppButton>
          {canReopen ? (
            <AppButton
              className="min-h-11"
              disabled={reopenSessionMutation.isPending}
              onClick={() => void reopenSessionMutation.mutateAsync()}
              size="sm"
              variant="outline"
            >
              {reopenSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <OctagonMinus className="h-4 w-4" />}
              Переоткрыть
            </AppButton>
          ) : null}
        </div>
      )}
    </div>
  ) : null;

  const content = (
    <div className={cn("flex h-full flex-col overflow-hidden bg-background shadow-panel", isMobile ? "h-svh w-full" : "max-h-[calc(100svh-2rem)] w-[min(980px,calc(100vw-2rem))] rounded-[30px] border border-border/80")}>
      {header}
      {editorBody}
      {bottomBar}
    </div>
  );

  if (!isOpen) {
    return null;
  }

  const shell = isMobile ? (
    <MobileSheet className="h-full" closeOnBackdropClick={false} onClose={onClose}>
      {content}
    </MobileSheet>
  ) : createPortal(
    <div
      className="fixed inset-0 z-[410] bg-background/80 backdrop-blur-sm"
      onClick={() => {
        if (draftPoints.length > 0 && !window.confirm("Закрыть редактор и потерять незавершённую фигуру?")) {
          return;
        }
        onClose();
      }}
    >
      <div className="absolute inset-y-4 right-4" onClick={(event) => event.stopPropagation()}>
        {content}
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      {shell}
      {sessionId ? (
        <InspectionMarkSheet
          canEdit={canEdit}
          draft={markSheetDraft}
          isMobile={isMobile}
          isOpen={markSheetDraft !== null}
          onClose={() => setMarkSheetDraft(null)}
          onDeleteMark={handleDeleteMark}
          onSave={handleSaveMark}
          orderId={orderId}
          sessionId={sessionId}
        />
      ) : null}
    </>
  );
}
