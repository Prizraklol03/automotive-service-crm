export type PhotoStage = "inspection" | "before" | "process" | "after";

export type OrderPhoto = {
  created_at: string;
  filename: string;
  id: number;
  order_id: number;
  sort_order: number;
  stage: PhotoStage;
};

export type PublicOrderPhoto = {
  photo_key: string;
  sort_order: number;
  stage: PhotoStage;
};

export type OrderShareInfo = {
  share_token: string | null;
  share_url: string | null;
};

export const STAGE_LABELS: Record<PhotoStage, string> = {
  inspection: "Осмотр",
  before: "До",
  process: "В процессе",
  after: "После"
};

export const STAGE_ORDER: PhotoStage[] = ["inspection", "before", "process", "after"];
