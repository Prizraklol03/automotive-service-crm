export type InspectionSessionStatus =
  | "not_started"
  | "draft"
  | "in_progress"
  | "completed"
  | "confirmed"
  | "locked";

export type InspectionViewType = "front" | "rear" | "left" | "right" | "top" | "interior";

export type InspectionGeometryType = "point" | "line" | "polygon";

export type InspectionDefectType =
  | "scratch"
  | "chip"
  | "crack"
  | "dent"
  | "scuff"
  | "paint_damage"
  | "stain"
  | "other";

export type InspectionSeverity = "low" | "medium" | "high";

export type InspectionMarkStatus = "existing_before_work" | "found_during_work" | "fixed" | "ignored";

export type InspectionPoint = {
  x: number;
  y: number;
};

export type InspectionGeometry = {
  points: InspectionPoint[];
};

export type InspectionUserMini = {
  id: number;
  full_name: string;
};

export type InspectionMarkPhoto = {
  created_at: string;
  file_path: string;
  height: number | null;
  id: number;
  inspection_mark_id: number;
  mime_type: string;
  original_name: string;
  size_bytes: number;
  sort_order: number;
  uploaded_by_user_id: number;
  width: number | null;
};

export type InspectionGeneralPhoto = {
  created_at: string;
  file_path: string;
  height: number | null;
  id: number;
  inspection_session_id: number;
  mime_type: string;
  original_name: string;
  size_bytes: number;
  sort_order: number;
  uploaded_by_user_id: number;
  width: number | null;
};

export type InspectionMark = {
  comment: string | null;
  created_at: string;
  created_by_user_id: number;
  defect_type: InspectionDefectType;
  geometry_data: InspectionGeometry;
  geometry_type: InspectionGeometryType;
  id: number;
  inspection_session_id: number;
  order_id: number;
  photos: InspectionMarkPhoto[];
  severity: InspectionSeverity;
  sort_order: number;
  status: InspectionMarkStatus;
  updated_at: string;
  updated_by_user_id: number;
  vehicle_id: number;
  view_type: InspectionViewType;
  zone_key: string | null;
};

export type InspectionExport = {
  created_at: string;
  created_by_user_id: number;
  document_id: number | null;
  docx_path: string | null;
  export_payload_json: Record<string, unknown>;
  id: number;
  inspection_session_id: number;
  pdf_path: string | null;
  snapshot_json: Record<string, unknown>;
};

export type InspectionSession = {
  checklist_json: Record<string, unknown> | null;
  completed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  created_by: InspectionUserMini | null;
  created_by_user_id: number;
  export_front_image_path: string | null;
  export_interior_image_path: string | null;
  export_left_image_path: string | null;
  export_rear_image_path: string | null;
  export_right_image_path: string | null;
  export_top_image_path: string | null;
  general_comment: string | null;
  general_photos_count: number;
  id: number;
  latest_export: InspectionExport | null;
  locked_at: string | null;
  mark_photos_count: number;
  marks_count: number;
  order_id: number;
  snapshot_version: number;
  started_at: string | null;
  status: InspectionSessionStatus;
  updated_at: string;
  updated_by: InspectionUserMini | null;
  updated_by_user_id: number;
  vehicle_id: number;
};

export type InspectionSessionDetail = InspectionSession & {
  general_photos: InspectionGeneralPhoto[];
  marks: InspectionMark[];
};

export type InspectionHistoryItem = {
  action: string;
  actor_user_id: number;
  created_at: string;
  description: string | null;
  entity_id: number | null;
  entity_type: string;
  id: number;
  title: string;
};

export type InspectionHistory = {
  items: InspectionHistoryItem[];
};

export type InspectionExportPreview = {
  export_payload: Record<string, unknown>;
  session: InspectionSession;
  snapshot: Record<string, unknown>;
};

export type InspectionActGenerateResult = {
  document: import("@/entities/document/model/types").Document;
  export: InspectionExport;
  session: InspectionSession;
};

export type InspectionSessionPatchPayload = {
  checklist_json?: Record<string, unknown> | null;
  general_comment?: string | null;
  status?: InspectionSessionStatus;
};

export type InspectionMarkPayload = {
  comment: string | null;
  defect_type: InspectionDefectType;
  geometry_data: InspectionGeometry;
  geometry_type: InspectionGeometryType;
  severity: InspectionSeverity;
  sort_order?: number;
  status: InspectionMarkStatus;
  view_type: InspectionViewType;
  zone_key: string | null;
};

export type InspectionMarkPatchPayload = Partial<InspectionMarkPayload>;

export type InspectionMarkReorderPayload = {
  items: Array<{ id: number; sort_order: number }>;
};

export const INSPECTION_VIEW_ORDER: InspectionViewType[] = ["front", "rear", "left", "right", "top", "interior"];

export const INSPECTION_VIEW_LABELS: Record<InspectionViewType, string> = {
  front: "Спереди",
  rear: "Сзади",
  left: "Левый борт",
  right: "Правый борт",
  top: "Сверху",
  interior: "Салон",
};

export const INSPECTION_STATUS_LABELS: Record<InspectionSessionStatus, string> = {
  not_started: "Не начат",
  draft: "Черновик",
  in_progress: "В процессе",
  completed: "Завершён",
  confirmed: "Подтверждён",
  locked: "Заблокирован",
};

export const INSPECTION_DEFECT_LABELS: Record<InspectionDefectType, string> = {
  scratch: "Царапина",
  chip: "Скол",
  crack: "Трещина",
  dent: "Вмятина",
  scuff: "Потёртость",
  paint_damage: "Повреждение ЛКП",
  stain: "Пятно",
  other: "Другое",
};

export const INSPECTION_SEVERITY_LABELS: Record<InspectionSeverity, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
};

export const INSPECTION_MARK_STATUS_LABELS: Record<InspectionMarkStatus, string> = {
  existing_before_work: "До работ",
  found_during_work: "Обнаружено в работе",
  fixed: "Исправлено",
  ignored: "Без изменений",
};
