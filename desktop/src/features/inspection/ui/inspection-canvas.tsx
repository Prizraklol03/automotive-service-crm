import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Layer, Line, Stage, Text } from "react-konva";

import type { InspectionGeometryType, InspectionMark, InspectionPoint, InspectionViewType } from "@/features/inspection/model/types";
import { INSPECTION_VIEW_LABELS } from "@/features/inspection/model/types";
import { cn } from "@/shared/lib/cn";

type InspectionCanvasTool = "view" | InspectionGeometryType;

const MARK_COLORS = {
  low: "#f59e0b",
  medium: "#4ea8ff",
  high: "#ef4444",
} as const;

const MIN_VERTEX_DISTANCE = 0.005;

type EditableGeometryState = {
  geometryType: InspectionGeometryType;
  points: InspectionPoint[];
  severity: InspectionMark["severity"];
  viewType: InspectionViewType;
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const element = ref.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });

    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampPoint(point: InspectionPoint): InspectionPoint {
  return {
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  };
}

function toPixels(point: InspectionPoint, width: number, height: number) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function flattenPoints(points: InspectionPoint[], width: number, height: number) {
  return points.flatMap((point) => {
    const scaled = toPixels(point, width, height);
    return [scaled.x, scaled.y];
  });
}

function translatePoints(points: InspectionPoint[], dx: number, dy: number) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const safeDx = clamp(dx, -minX, 1 - maxX);
  const safeDy = clamp(dy, -minY, 1 - maxY);
  return points.map((point) => clampPoint({ x: point.x + safeDx, y: point.y + safeDy }));
}

function pointsKey(points: InspectionPoint[]) {
  return points.map((point) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`).join("|");
}

function pointsDiffer(left: InspectionPoint[], right: InspectionPoint[]) {
  return pointsKey(left) !== pointsKey(right);
}

export function InspectionCanvas({
  activeMarkId,
  canEdit,
  className,
  currentView,
  draftPoints,
  editingGeometry,
  editingMarkId,
  marks,
  onCanvasTap,
  onChangeEditingGeometry,
  onSelectMark,
  onSelectVertex,
  selectedVertexIndex,
  tool,
}: {
  activeMarkId: number | null;
  canEdit: boolean;
  className?: string;
  currentView: InspectionViewType;
  draftPoints: InspectionPoint[];
  editingGeometry: EditableGeometryState | null;
  editingMarkId: number | null;
  marks: InspectionMark[];
  onCanvasTap: (point: InspectionPoint) => void;
  onChangeEditingGeometry: (points: InspectionPoint[], options?: { commitHistory?: boolean }) => void;
  onSelectMark: (markId: number) => void;
  onSelectVertex: (vertexIndex: number | null) => void;
  selectedVertexIndex: number | null;
  tool: InspectionCanvasTool;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const stageRef = useRef<import("konva/lib/Stage").Stage | null>(null);
  const shapeDragStartRef = useRef<InspectionPoint[] | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const backgroundUrl = `/inspection/${currentView}.svg`;

  const marksForView = useMemo(() => {
    const filtered = marks
      .filter((mark) => mark.view_type === currentView)
      .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
    if (!editingGeometry || editingMarkId == null || editingGeometry.viewType !== currentView) {
      return filtered;
    }
    return filtered.map((mark) =>
      mark.id === editingMarkId
        ? {
            ...mark,
            geometry_type: editingGeometry.geometryType,
            geometry_data: { points: editingGeometry.points },
            severity: editingGeometry.severity,
          }
        : mark,
    );
  }, [currentView, editingGeometry, editingMarkId, marks]);

  const draftFlatPoints = flattenPoints(draftPoints, size.width, size.height);
  const editingMark = useMemo(
    () => marksForView.find((mark) => mark.id === editingMarkId) ?? null,
    [editingMarkId, marksForView],
  );

  const handleStageTap = (event: import("konva/lib/Node").KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool === "view" || !size.width || !size.height) {
      return;
    }
    if (event.target !== event.target.getStage()) {
      return;
    }
    const stage = stageRef.current;
    const position = stage?.getPointerPosition();
    if (!position) {
      return;
    }
    onCanvasTap({
      x: clamp(position.x / size.width, 0, 1),
      y: clamp(position.y / size.height, 0, 1),
    });
  };

  const startShapeDrag = () => {
    if (!editingGeometry) {
      return;
    }
    shapeDragStartRef.current = editingGeometry.points;
    setIsDraggingShape(true);
  };

  const finishShapeDrag = (
    event: import("konva/lib/Node").KonvaEventObject<DragEvent>,
    basePoints: InspectionPoint[],
  ) => {
    const dx = size.width > 0 ? event.target.x() / size.width : 0;
    const dy = size.height > 0 ? event.target.y() / size.height : 0;
    event.target.position({ x: 0, y: 0 });
    setIsDraggingShape(false);
    shapeDragStartRef.current = null;

    const nextPoints = translatePoints(basePoints, dx, dy);
    if (pointsDiffer(basePoints, nextPoints)) {
      onChangeEditingGeometry(nextPoints, { commitHistory: true });
    }
  };

  const handleShapeDragEnd = (event: import("konva/lib/Node").KonvaEventObject<DragEvent>) => {
    const basePoints = shapeDragStartRef.current ?? editingGeometry?.points;
    if (!basePoints) {
      setIsDraggingShape(false);
      return;
    }
    finishShapeDrag(event, basePoints);
  };

  const handleVertexDragMove = (
    vertexIndex: number,
    event: import("konva/lib/Node").KonvaEventObject<DragEvent>,
  ) => {
    if (!editingGeometry || !size.width || !size.height) {
      return;
    }
    const nextPoints = editingGeometry.points.map((point, index) => {
      if (index !== vertexIndex) {
        return point;
      }
      return clampPoint({
        x: event.target.x() / size.width,
        y: event.target.y() / size.height,
      });
    });
    if (!pointsDiffer(editingGeometry.points, nextPoints)) {
      return;
    }
    onSelectVertex(vertexIndex);
    onChangeEditingGeometry(nextPoints, { commitHistory: false });
  };

  return (
    <div className={cn("rounded-[24px] border border-border/80 bg-[#111317] p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-sm font-medium text-foreground">{INSPECTION_VIEW_LABELS[currentView]}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {tool === "view" ? "Просмотр" : tool === "point" ? "Точка" : tool === "line" ? "Линия" : "Область"}
          </div>
        </div>
        {editingMark && canEdit ? (
          <div className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
            Редактирование геометрии
          </div>
        ) : null}
      </div>

      <div
        ref={ref}
        className="relative h-[46svh] min-h-[340px] overflow-hidden rounded-[20px] bg-[#151921] lg:h-[520px]"
        style={{ touchAction: tool === "view" ? "pan-y" : "none" }}
      >
        <img
          alt={INSPECTION_VIEW_LABELS[currentView]}
          className="absolute inset-0 h-full w-full object-contain p-2 opacity-90"
          draggable={false}
          src={backgroundUrl}
        />

        {size.width > 0 && size.height > 0 ? (
          <Stage
            ref={stageRef}
            className="absolute inset-0"
            height={size.height}
            onClick={handleStageTap}
            onTap={handleStageTap}
            width={size.width}
          >
            <Layer>
              {marksForView.map((mark, index) => {
                const isActive = activeMarkId === mark.id;
                const isEditingCurrentMark = canEdit && editingMarkId === mark.id && editingGeometry?.viewType === currentView;
                const color = MARK_COLORS[mark.severity];
                const linePoints = flattenPoints(mark.geometry_data.points, size.width, size.height);
                const firstPoint = mark.geometry_data.points[0] ? toPixels(mark.geometry_data.points[0], size.width, size.height) : null;
                const showHandles = isEditingCurrentMark && !isDraggingShape;

                return (
                  <Fragment key={mark.id}>
                    {mark.geometry_type === "point" && firstPoint ? (
                      <Circle
                        draggable={isEditingCurrentMark}
                        fill={color}
                        onClick={() => onSelectMark(mark.id)}
                        onDragEnd={handleShapeDragEnd}
                        onDragStart={startShapeDrag}
                        onTap={() => onSelectMark(mark.id)}
                        radius={isEditingCurrentMark ? 16 : isActive ? 14 : 11}
                        shadowBlur={isActive ? 20 : 10}
                        shadowColor={color}
                        stroke="#ffffff"
                        strokeWidth={isActive ? 4 : 3}
                        x={firstPoint.x}
                        y={firstPoint.y}
                      />
                    ) : (
                      <Line
                        closed={mark.geometry_type === "polygon"}
                        draggable={isEditingCurrentMark}
                        fill={mark.geometry_type === "polygon" ? (isActive ? `${color}50` : `${color}30`) : undefined}
                        hitStrokeWidth={30}
                        lineCap="round"
                        lineJoin="round"
                        onClick={() => onSelectMark(mark.id)}
                        onDragEnd={handleShapeDragEnd}
                        onDragStart={startShapeDrag}
                        onTap={() => onSelectMark(mark.id)}
                        points={linePoints}
                        shadowBlur={isActive ? 18 : 8}
                        shadowColor={color}
                        stroke={color}
                        strokeWidth={isEditingCurrentMark ? 9 : isActive ? 8 : 6}
                      />
                    )}

                    {showHandles
                      ? mark.geometry_data.points.map((point, vertexIndex) => {
                          const scaled = toPixels(point, size.width, size.height);
                          const isSelectedVertex = selectedVertexIndex === vertexIndex;
                          return (
                            <Fragment key={`${mark.id}-${vertexIndex}`}>
                              <Circle
                                fill="rgba(78,168,255,0.18)"
                                listening={false}
                                radius={18}
                                x={scaled.x}
                                y={scaled.y}
                              />
                              <Circle
                                draggable
                                fill={isSelectedVertex ? "#ffffff" : "#4ea8ff"}
                                onClick={() => onSelectVertex(vertexIndex)}
                                onDragMove={(event) => handleVertexDragMove(vertexIndex, event)}
                                onTap={() => onSelectVertex(vertexIndex)}
                                radius={isSelectedVertex ? 10 : 8}
                                stroke={isSelectedVertex ? "#4ea8ff" : "#ffffff"}
                                strokeWidth={3}
                                x={scaled.x}
                                y={scaled.y}
                              />
                            </Fragment>
                          );
                        })
                      : null}

                    {firstPoint ? (
                      <>
                        <Circle fill="#0f172a" listening={false} radius={14} x={firstPoint.x + 18} y={firstPoint.y - 18} />
                        <Text
                          align="center"
                          fill="#ffffff"
                          fontSize={12}
                          fontStyle="bold"
                          listening={false}
                          offsetX={8}
                          offsetY={8}
                          text={String(index + 1)}
                          x={firstPoint.x + 18}
                          y={firstPoint.y - 18}
                        />
                      </>
                    ) : null}
                  </Fragment>
                );
              })}

              {tool !== "view" && draftPoints.length > 0 ? (
                <>
                  {tool === "point" && draftPoints[0] ? (
                    (() => {
                      const point = toPixels(draftPoints[0], size.width, size.height);
                      return <Circle fill="#4ea8ff" radius={13} stroke="#ffffff" strokeWidth={3} x={point.x} y={point.y} />;
                    })()
                  ) : (
                    <Line
                      closed={tool === "polygon" && draftPoints.length >= 3}
                      dash={tool === "polygon" ? [8, 6] : undefined}
                      fill={tool === "polygon" && draftPoints.length >= 3 ? "#4ea8ff22" : undefined}
                      lineCap="round"
                      lineJoin="round"
                      points={draftFlatPoints}
                      stroke="#4ea8ff"
                      strokeWidth={4}
                    />
                  )}
                  {draftPoints.map((point, index) => {
                    const scaled = toPixels(point, size.width, size.height);
                    return <Circle key={`${point.x}-${point.y}-${index}`} fill="#4ea8ff" radius={8} x={scaled.x} y={scaled.y} />;
                  })}
                </>
              ) : null}
            </Layer>
          </Stage>
        ) : null}
      </div>
    </div>
  );
}

export function canDeleteInspectionVertex(geometryType: InspectionGeometryType, points: InspectionPoint[], vertexIndex: number | null) {
  if (vertexIndex == null) {
    return false;
  }
  if (geometryType === "point") {
    return false;
  }
  if (geometryType === "line") {
    return points.length > 2;
  }
  return points.length > 3;
}

export function deleteInspectionVertex(points: InspectionPoint[], vertexIndex: number | null) {
  if (vertexIndex == null) {
    return points;
  }
  return points.filter((_, index) => index !== vertexIndex);
}

export function canUndoInspectionGeometry(history: InspectionPoint[][]) {
  return history.length > 1;
}

export function shouldUpdateGeometry(points: InspectionPoint[], nextPoints: InspectionPoint[]) {
  if (points.length !== nextPoints.length) {
    return true;
  }
  return nextPoints.some((point, index) => {
    const current = points[index];
    if (!current) {
      return true;
    }
    return Math.abs(current.x - point.x) > MIN_VERTEX_DISTANCE || Math.abs(current.y - point.y) > MIN_VERTEX_DISTANCE;
  });
}

export type { EditableGeometryState, InspectionCanvasTool };
