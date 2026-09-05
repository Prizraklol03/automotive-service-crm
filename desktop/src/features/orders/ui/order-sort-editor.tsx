import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import {
  ORDER_SORT_DEFAULT_DIRECTIONS,
  ORDER_SORT_KEYS,
  ORDER_SORT_LABELS,
  type OrderSortDescriptor,
  type OrderSortDirection,
  type OrderSortKey
} from "@/features/orders/model/order-sorting";
import { cn } from "@/shared/lib/cn";
import { AppSelect } from "@/shared/ui/app-select";
import { AppSwitch } from "@/shared/ui/app-switch";

type SortRow = OrderSortDescriptor & { enabled: boolean };

function buildRows(descriptors: OrderSortDescriptor[]): SortRow[] {
  const descriptorMap = new Map(descriptors.map((descriptor) => [descriptor.key, descriptor]));
  const orderedKeys = [
    ...descriptors.map((descriptor) => descriptor.key),
    ...ORDER_SORT_KEYS.filter((key) => !descriptorMap.has(key))
  ];
  return orderedKeys.map((key) => ({
    direction: descriptorMap.get(key)?.direction ?? ORDER_SORT_DEFAULT_DIRECTIONS[key],
    enabled: descriptorMap.has(key),
    key
  }));
}

function activeDescriptors(rows: SortRow[]): OrderSortDescriptor[] {
  return rows.filter((row) => row.enabled).map(({ direction, key }) => ({ direction, key }));
}

export function OrderSortEditor({
  descriptors,
  disabled = false,
  minimumOne = false,
  onChange
}: {
  descriptors: OrderSortDescriptor[];
  disabled?: boolean;
  minimumOne?: boolean;
  onChange: (descriptors: OrderSortDescriptor[]) => void;
}) {
  const descriptorSignature = JSON.stringify(descriptors);
  const [rows, setRows] = useState<SortRow[]>(() => buildRows(descriptors));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setRows(buildRows(descriptors));
  }, [descriptorSignature]);

  const rowIds = useMemo(() => rows.map((row) => row.key), [rows]);

  const commit = (nextRows: SortRow[]) => {
    setRows(nextRows);
    onChange(activeDescriptors(nextRows));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const fromIndex = rows.findIndex((row) => row.key === active.id);
    const toIndex = rows.findIndex((row) => row.key === over.id);
    if (fromIndex >= 0 && toIndex >= 0) {
      commit(arrayMove(rows, fromIndex, toIndex));
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5" data-testid="order-sort-editor">
          {rows.map((row, index) => (
            <SortableRow
              key={row.key}
              disabled={disabled}
              index={index}
              row={row}
              switchDisabled={disabled || (minimumOne && row.enabled && rows.filter((item) => item.enabled).length <= 1)}
              onDirectionChange={(direction) =>
                commit(rows.map((item) => (item.key === row.key ? { ...item, direction } : item)))
              }
              onEnabledChange={(enabled) =>
                commit(rows.map((item) => (item.key === row.key ? { ...item, enabled } : item)))
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  disabled,
  index,
  onDirectionChange,
  onEnabledChange,
  row,
  switchDisabled
}: {
  disabled: boolean;
  index: number;
  onDirectionChange: (direction: OrderSortDirection) => void;
  onEnabledChange: (enabled: boolean) => void;
  row: SortRow;
  switchDisabled: boolean;
}) {
  const labelId = `order-sort-label-${row.key}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    disabled,
    id: row.key
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid min-h-12 grid-cols-[32px_44px_minmax(0,1fr)_24px] items-center gap-2 rounded-md border border-border/70 bg-background/30 px-2 py-1.5 sm:grid-cols-[36px_44px_minmax(0,1fr)_minmax(132px,172px)_28px]",
        !row.enabled && "text-muted-foreground",
        isDragging && "z-10 border-accent/70 bg-surface shadow-panel"
      )}
    >
      <button
        type="button"
        aria-label={`Изменить приоритет: ${ORDER_SORT_LABELS[row.key]}`}
        className="flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground active:cursor-grabbing"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <AppSwitch aria-labelledby={labelId} checked={row.enabled} disabled={switchDisabled} onChange={onEnabledChange} />
      <span id={labelId} className="min-w-0 truncate text-sm font-medium text-foreground">{ORDER_SORT_LABELS[row.key]}</span>
      <AppSelect
        aria-label={`Направление: ${ORDER_SORT_LABELS[row.key]}`}
        className="col-span-3 col-start-2 row-start-2 h-9 rounded-md py-1 text-xs sm:col-auto sm:row-auto"
        disabled={disabled || !row.enabled}
        value={row.direction}
        onChange={(event) => onDirectionChange(event.target.value as OrderSortDirection)}
      >
        <option value="asc">По возрастанию</option>
        <option value="desc">По убыванию</option>
      </AppSelect>
      <span className="col-start-4 row-start-1 text-center text-xs tabular-nums text-muted-foreground sm:col-auto sm:row-auto">{index + 1}</span>
    </div>
  );
}
