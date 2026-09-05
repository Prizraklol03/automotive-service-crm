import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GripHorizontal, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  useCreateOrderStatusMutation,
  useDeleteOrderStatusMutation,
  useOrderStatusesQuery,
  useReorderStatusesMutation,
  useUpdateOrderStatusMutation,
} from "@/features/settings/api/settings-hooks";
import type { CrmOrderStatus, OrderStatusCreatePayload, StatusGroup } from "@/entities/settings/model/types";
import {
  ARCHIVED_GROUPS,
  STATUS_GROUP_DESCRIPTIONS,
  STATUS_GROUP_LABELS,
  STATUS_GROUP_ORDER,
} from "@/entities/settings/model/types";
import { cn } from "@/shared/lib/cn";
import { AppButton } from "@/shared/ui/app-button";
import { SectionCard } from "@/shared/ui/section-card";

const COLOR_PRESETS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16",
  "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#6b7280",
];

type FormState = {
  display_name: string;
  status_group: StatusGroup;
  color: string;
  is_default: boolean;
};

type ActiveStatusDrag = {
  code: string;
  currentClientY: number;
  currentOrderedCodes: string[];
  initialOrderedCodes: string[];
  pointerOffsetY: number;
  rowHeight: number;
  rowLeft: number;
  rowWidth: number;
};

const EMPTY_FORM: FormState = {
  display_name: "",
  status_group: "new",
  color: "#6366f1",
  is_default: false,
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function insertDraggedAt(codes: string[], draggedCode: string, insertIndex: number) {
  const next = codes.filter((code) => code !== draggedCode);
  next.splice(insertIndex, 0, draggedCode);
  return next;
}

function StatusForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  isEdit,
}: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  isSaving: boolean;
  isEdit?: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);

  return (
    <div className="rounded-2xl border border-border/80 bg-surface-2/60 p-4">
      <p className="mb-4 text-sm font-semibold">{isEdit ? "Редактировать статус" : "Добавить статус"}</p>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">Название</label>
        <input
          type="text"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Например: Сушка"
          value={form.display_name}
          onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
          autoFocus
        />
      </div>

      <div className="mb-3">
        <p className="mb-2 text-xs text-muted-foreground">Тип статуса</p>
        <div className="space-y-1.5">
          {STATUS_GROUP_ORDER.map((group) => (
            <label key={group} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface/60">
              <input
                type="radio"
                name="status_group"
                value={group}
                checked={form.status_group === group}
                onChange={() => setForm((current) => ({ ...current, status_group: group }))}
                className="mt-0.5 accent-[hsl(var(--accent))]"
              />
              <span>
                <span className="text-sm font-medium text-foreground">{STATUS_GROUP_LABELS[group]}</span>
                <span className="ml-2 text-xs text-muted-foreground">— {STATUS_GROUP_DESCRIPTIONS[group]}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs text-muted-foreground">Цвет</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => setForm((current) => ({ ...current, color }))}
              className={cn(
                "h-7 w-7 rounded-full transition-transform hover:scale-110",
                form.color === color && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
            className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
            title="Произвольный цвет"
          />
        </div>
      </div>

      <label className="mb-4 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
          className="accent-[hsl(var(--accent))]"
        />
        <span className="text-sm text-foreground">Статус по умолчанию</span>
        <span className="text-xs text-muted-foreground">(присваивается новым заказам)</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <AppButton size="sm" onClick={() => onSave(form)} disabled={isSaving || !form.display_name.trim()}>
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Сохранить
        </AppButton>
        <AppButton size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
          Отмена
        </AppButton>
      </div>
    </div>
  );
}

function StatusRow({
  status,
  index,
  canDrag,
  onDragStart,
  onEdit,
  onDelete,
  isDeleting,
}: {
  status: CrmOrderStatus;
  index: number;
  canDrag: boolean;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isArchived = ARCHIVED_GROUPS.includes(status.status_group);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border border-border/60 bg-surface/30 px-3 py-3 transition-[border-color,background-color,box-shadow,transform] duration-200",
        canDrag && "hover:border-border/90 hover:bg-surface/45 hover:shadow-[0_10px_30px_rgba(0,0,0,0.10)]",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex h-10 w-10 shrink-0 touch-none items-center justify-center rounded-2xl border border-border/70 bg-surface-2 text-muted-foreground transition-all duration-200",
          canDrag
            ? "cursor-grab group-hover:border-accent/30 group-hover:bg-accent-muted/40 group-hover:text-foreground active:cursor-grabbing"
            : "cursor-not-allowed opacity-50",
        )}
        aria-label={`Переместить статус ${status.display_name}`}
        title="Перетащите, чтобы изменить порядок"
        disabled={!canDrag}
        onPointerDown={onDragStart}
        onClick={(event) => event.stopPropagation()}
      >
        <GripHorizontal className="h-5 w-5" />
      </button>

      <div className="flex min-w-[2.25rem] shrink-0 items-center justify-center px-1 text-base font-semibold tracking-[-0.02em] text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </div>

      <span
        className="inline-flex h-3 w-3 shrink-0 rounded-full ring-4 ring-background/70"
        style={{ backgroundColor: status.color }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{status.display_name}</span>
          {status.is_default ? (
            <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
              По умолчанию
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{STATUS_GROUP_LABELS[status.status_group]}{isArchived ? " · архив" : ""}</span>
          <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]">
            {status.code}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        title="Редактировать"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
        title="Удалить"
      >
        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function StatusTableCard() {
  const statusesQuery = useOrderStatusesQuery();
  const createMutation = useCreateOrderStatusMutation();
  const updateMutation = useUpdateOrderStatusMutation();
  const deleteMutation = useDeleteOrderStatusMutation();
  const reorderMutation = useReorderStatusesMutation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [statusOrder, setStatusOrder] = useState<string[]>([]);
  const [activeStatusDrag, setActiveStatusDrag] = useState<ActiveStatusDrag | null>(null);

  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const activeStatusDragRef = useRef<ActiveStatusDrag | null>(null);
  const pointerClientYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);
  const justDraggedTimeoutRef = useRef<number | null>(null);
  const layoutSnapshotRef = useRef<Map<string, number> | null>(null);

  const statuses = statusesQuery.data ?? [];
  const canReorderStatuses = !showAddForm && !editingCode && !deleteConfirm && !reorderMutation.isPending;

  useEffect(() => {
    setStatusOrder((current) => {
      const codes = statuses.map((status) => status.code);
      const keptCodes = current.filter((code) => codes.includes(code));
      const appendedCodes = codes.filter((code) => !keptCodes.includes(code));
      return [...keptCodes, ...appendedCodes];
    });
  }, [statuses]);

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
      }
      if (justDraggedTimeoutRef.current !== null) {
        window.clearTimeout(justDraggedTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const snapshot = layoutSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    snapshot.forEach((previousTop, code) => {
      const element = rowRefs.current.get(code);
      if (!element) {
        return;
      }

      const nextTop = element.getBoundingClientRect().top;
      const diff = previousTop - nextTop;
      if (Math.abs(diff) < 1) {
        return;
      }

      element.animate(
        [
          { transform: `translateY(${diff}px)` },
          { transform: "translateY(0)" },
        ],
        {
          duration: 180,
          easing: "ease-out",
        },
      );
    });

    layoutSnapshotRef.current = null;
  }, [statusOrder]);

  const statusesByCode = useMemo(
    () => new Map(statuses.map((status) => [status.code, status])),
    [statuses],
  );

  const orderedStatuses = useMemo(() => {
    const orderedCodes = statusOrder.length ? statusOrder : statuses.map((status) => status.code);
    return orderedCodes
      .map((code) => statusesByCode.get(code))
      .filter((status): status is CrmOrderStatus => Boolean(status));
  }, [statusOrder, statuses, statusesByCode]);

  const activeDraggedStatus = useMemo(
    () => (activeStatusDrag ? statusesByCode.get(activeStatusDrag.code) ?? null : null),
    [activeStatusDrag, statusesByCode],
  );
  const draggedStatusIndex = useMemo(
    () => (activeDraggedStatus ? orderedStatuses.findIndex((status) => status.code === activeDraggedStatus.code) : -1),
    [activeDraggedStatus, orderedStatuses],
  );

  const statusGroupCounts = STATUS_GROUP_ORDER.map((group) => ({
    count: orderedStatuses.filter((status) => status.status_group === group).length,
    group,
  })).filter((item) => item.count > 0);

  function handleAdd(form: FormState) {
    setServerError(null);
    const payload: OrderStatusCreatePayload = {
      display_name: form.display_name,
      status_group: form.status_group,
      color: form.color,
      is_default: form.is_default,
      sort_order: orderedStatuses.length,
    };
    createMutation.mutate(payload, {
      onSuccess: () => setShowAddForm(false),
      onError: (error) => setServerError(error instanceof Error ? error.message : "Ошибка при создании"),
    });
  }

  function handleEdit(code: string, form: FormState) {
    setServerError(null);
    const existing = orderedStatuses.find((status) => status.code === code);
    if (!existing) {
      return;
    }

    updateMutation.mutate(
      {
        code,
        payload: {
          display_name: form.display_name,
          status_group: form.status_group,
          color: form.color,
          is_default: form.is_default,
          sort_order: existing.sort_order,
        },
      },
      {
        onSuccess: () => setEditingCode(null),
        onError: (error) => setServerError(error instanceof Error ? error.message : "Ошибка при сохранении"),
      },
    );
  }

  function handleDelete(code: string) {
    setServerError(null);
    deleteMutation.mutate(code, {
      onSuccess: () => setDeleteConfirm(null),
      onError: (error) => setServerError(error instanceof Error ? error.message : "Ошибка при удалении"),
    });
  }

  function snapshotRowPositions(codes: string[]) {
    const snapshot = new Map<string, number>();

    codes.forEach((code) => {
      const element = rowRefs.current.get(code);
      if (!element) {
        return;
      }
      snapshot.set(code, element.getBoundingClientRect().top);
    });

    layoutSnapshotRef.current = snapshot;
  }

  function syncDragPosition(clientY: number) {
    const drag = activeStatusDragRef.current;
    if (!drag) {
      return;
    }

    const otherCodes = drag.currentOrderedCodes.filter((code) => code !== drag.code);
    const draggedCenter = window.scrollY + clientY - drag.pointerOffsetY + drag.rowHeight / 2;
    const insertIndex = otherCodes.filter((code) => {
      const element = rowRefs.current.get(code);
      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const midpoint = rect.top + window.scrollY + rect.height / 2;
      return draggedCenter > midpoint;
    }).length;

    const nextOrderedCodes = insertDraggedAt(drag.currentOrderedCodes, drag.code, insertIndex);

    if (!arraysEqual(nextOrderedCodes, drag.currentOrderedCodes)) {
      snapshotRowPositions(drag.currentOrderedCodes);
      setStatusOrder(nextOrderedCodes);

      const nextDrag = {
        ...drag,
        currentClientY: clientY,
        currentOrderedCodes: nextOrderedCodes,
      };
      activeStatusDragRef.current = nextDrag;
      setActiveStatusDrag(nextDrag);
      return;
    }

    const nextDrag = { ...drag, currentClientY: clientY };
    activeStatusDragRef.current = nextDrag;
    setActiveStatusDrag(nextDrag);
  }

  function stopAutoScroll() {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  function startAutoScroll() {
    stopAutoScroll();

    const step = () => {
      const clientY = pointerClientYRef.current;
      if (clientY === null || !activeStatusDragRef.current) {
        autoScrollFrameRef.current = null;
        return;
      }

      const threshold = 96;
      let scrollDelta = 0;

      if (clientY < threshold) {
        scrollDelta = -Math.max(8, Math.ceil((threshold - clientY) / 4));
      } else if (clientY > window.innerHeight - threshold) {
        scrollDelta = Math.max(8, Math.ceil((clientY - (window.innerHeight - threshold)) / 4));
      }

      if (scrollDelta !== 0) {
        window.scrollBy({ top: scrollDelta });
        syncDragPosition(clientY);
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(step);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(step);
  }

  function clearDragGuard() {
    if (justDraggedTimeoutRef.current !== null) {
      window.clearTimeout(justDraggedTimeoutRef.current);
    }

    justDraggedTimeoutRef.current = window.setTimeout(() => {
      justDraggedRef.current = false;
      justDraggedTimeoutRef.current = null;
    }, 120);
  }

  async function finishStatusDrag() {
    stopAutoScroll();
    const drag = activeStatusDragRef.current;
    activeStatusDragRef.current = null;
    pointerClientYRef.current = null;
    setActiveStatusDrag(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (!drag) {
      return;
    }

    justDraggedRef.current = true;
    clearDragGuard();

    if (arraysEqual(drag.currentOrderedCodes, drag.initialOrderedCodes)) {
      return;
    }

    setServerError(null);
    reorderMutation.mutate(drag.currentOrderedCodes, {
      onError: (error) => {
        setStatusOrder(drag.initialOrderedCodes);
        setServerError(error instanceof Error ? error.message : "Ошибка при изменении порядка");
      },
    });
  }

  useEffect(() => {
    if (!activeStatusDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      pointerClientYRef.current = event.clientY;
      syncDragPosition(event.clientY);
    };

    const handlePointerUp = () => {
      void finishStatusDrag();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    startAutoScroll();

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      stopAutoScroll();
    };
  }, [activeStatusDrag]);

  function beginStatusDrag(event: ReactPointerEvent<HTMLButtonElement>, code: string) {
    if (!canReorderStatuses || event.button !== 0) {
      return;
    }

    const rowElement = rowRefs.current.get(code);
    if (!rowElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentOrderedCodes = orderedStatuses.map((status) => status.code);
    const rect = rowElement.getBoundingClientRect();
    const nextDrag: ActiveStatusDrag = {
      code,
      currentClientY: event.clientY,
      currentOrderedCodes,
      initialOrderedCodes: currentOrderedCodes,
      pointerOffsetY: event.clientY - rect.top,
      rowHeight: rect.height,
      rowLeft: rect.left,
      rowWidth: rect.width,
    };

    pointerClientYRef.current = event.clientY;
    activeStatusDragRef.current = nextDrag;
    setActiveStatusDrag(nextDrag);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }

  if (statusesQuery.isLoading) {
    return (
      <div className="glass-panel flex items-center gap-3 rounded-2xl p-5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Загружаем статусы...</span>
      </div>
    );
  }

  return (
    <>
      <SectionCard
        title="Статусы заказов"
        description="Здесь настраиваются состав, порядок и логика статусов. Очередность ниже используется в карточке заказа, списках, фильтрах и выпадающих меню по всей CRM."
        action={
          <AppButton
            size="sm"
            variant="outline"
            onClick={() => {
              setShowAddForm(true);
              setEditingCode(null);
            }}
            disabled={showAddForm || reorderMutation.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </AppButton>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {statusGroupCounts.map(({ count, group }) => (
            <span key={group} className="rounded-full border border-border/60 bg-surface-2/50 px-3 py-1 text-xs text-muted-foreground">
              {STATUS_GROUP_LABELS[group]}: <span className="font-medium text-foreground">{count}</span>
            </span>
          ))}
          <span className="rounded-full border border-border/60 bg-surface-2/50 px-3 py-1 text-xs text-muted-foreground">
            Всего: <span className="font-medium text-foreground">{orderedStatuses.length}</span>
          </span>
        </div>

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Порядок отображения</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Перетаскивайте статусы за ручку слева или пользуйтесь стрелками справа. Этот порядок сразу применяется во всей CRM.
            </p>
          </div>
          {reorderMutation.isPending ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface-2/50 px-3 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Сохраняем порядок...
            </div>
          ) : null}
        </div>

        {showAddForm ? (
          <div className="mb-3">
            <StatusForm
              initial={EMPTY_FORM}
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              isSaving={createMutation.isPending}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          {orderedStatuses.map((status, index) => (
            <div
              key={status.code}
              ref={(element) => {
                if (element) {
                  rowRefs.current.set(status.code, element);
                } else {
                  rowRefs.current.delete(status.code);
                }
              }}
            >
              {editingCode === status.code ? (
                <div className="py-2">
                  <StatusForm
                    isEdit
                    initial={{
                      display_name: status.display_name,
                      status_group: status.status_group,
                      color: status.color,
                      is_default: status.is_default,
                    }}
                    onSave={(form) => handleEdit(status.code, form)}
                    onCancel={() => setEditingCode(null)}
                    isSaving={updateMutation.isPending}
                  />
                </div>
              ) : deleteConfirm === status.code ? (
                <div className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-sm text-muted-foreground">
                    Удалить «{status.display_name}»? Это действие нельзя отменить.
                  </span>
                  <AppButton
                    size="sm"
                    variant="outline"
                    className="border-danger/60 text-danger hover:bg-danger/10"
                    onClick={() => handleDelete(status.code)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Удалить
                  </AppButton>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(null)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : activeStatusDrag?.code === status.code ? (
                <div
                  className="rounded-2xl border border-dashed border-accent/45 bg-accent-muted/35"
                  style={{ height: Math.max((activeStatusDrag.rowHeight || 72) - 4, 68) }}
                >
                  <div className="flex h-full items-center justify-center px-4 text-xs font-medium tracking-[0.08em] text-foreground/80">
                    Отпустите, чтобы зафиксировать позицию
                  </div>
                </div>
              ) : (
                <StatusRow
                  status={status}
                  index={index}
                  canDrag={canReorderStatuses}
                  onDragStart={(event) => beginStatusDrag(event, status.code)}
                  onEdit={() => {
                    if (justDraggedRef.current) {
                      return;
                    }
                    setEditingCode(status.code);
                    setShowAddForm(false);
                  }}
                  onDelete={() => {
                    if (justDraggedRef.current) {
                      return;
                    }
                    setDeleteConfirm(status.code);
                  }}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === status.code}
                />
              )}
            </div>
          ))}

          {!orderedStatuses.length && !showAddForm ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Статусы ещё не настроены</p>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg bg-surface-2/50 px-3 py-2.5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Типы статусов</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {STATUS_GROUP_ORDER.map((group) => (
              <div key={group} className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-foreground">{STATUS_GROUP_LABELS[group]}</span>
                <span className="text-xs text-muted-foreground">— {STATUS_GROUP_DESCRIPTIONS[group]}</span>
              </div>
            ))}
          </div>
        </div>

        {serverError ? <p className="mt-3 text-sm text-danger">{serverError}</p> : null}
      </SectionCard>

      {activeStatusDrag && activeDraggedStatus ? (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{
            left: activeStatusDrag.rowLeft,
            top: activeStatusDrag.currentClientY - activeStatusDrag.pointerOffsetY,
            width: activeStatusDrag.rowWidth,
          }}
        >
          <div className="overflow-hidden rounded-2xl border border-accent/35 bg-background/96 shadow-panel ring-1 ring-border/60 backdrop-blur-md">
            <div className="border-b border-border/60 bg-accent-muted/35 px-3 py-2 text-[11px] font-medium tracking-[0.12em] text-foreground/80">
              Перемещение статуса
            </div>
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-surface-2 text-muted-foreground">
                <GripHorizontal className="h-5 w-5" />
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-surface-2 text-sm font-semibold text-foreground">
                {draggedStatusIndex + 1}
              </div>
              <span
                className="inline-flex h-3 w-3 shrink-0 rounded-full ring-4 ring-background/70"
                style={{ backgroundColor: activeDraggedStatus.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{activeDraggedStatus.display_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {STATUS_GROUP_LABELS[activeDraggedStatus.status_group]}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
