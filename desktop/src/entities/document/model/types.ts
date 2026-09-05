export type DocumentType = "preliminary_work_order" | "work_order" | "completion_act" | "inspection_act";

export type DocumentTemplate = {
  code: DocumentType;
  created_at: string;
  id: number;
  is_active: boolean;
  name: string;
  storage_path: string;
  updated_at: string;
};

export type DocumentFile = {
  exists: boolean;
  filename: string | null;
  mime_type: string;
  storage_path: string | null;
};

export type Document = {
  created_at: string;
  created_by_user_id: number;
  docx_file: DocumentFile;
  document_number: number;
  document_type: DocumentType;
  id: number;
  last_rendered_at: string | null;
  manual_fields_by_design: string[];
  order_id: number;
  pdf_file: DocumentFile;
  storage_docx_path: string | null;
  storage_pdf_path: string | null;
  template: DocumentTemplate;
  template_id: number;
  unresolved_placeholders: string[];
  updated_at: string;
  work_completed_at: string | null;
  work_started_at: string;
  order_summary: {
    client_summary: {
      full_name: string;
      id: number;
      phone_display: string;
    };
    id: number;
    vehicle_summary: {
      brand: string | null;
      client_id: number;
      display_name: string;
      id: number;
      model: string | null;
      plate_number_display: string;
      vin: string | null;
    };
  };
};

export type DocumentWorkDatesPayload = {
  work_completed_at: string | null;
  work_started_at: string;
};

export type DocumentPreview = {
  document_id: number;
  document_number: number;
  document_type: DocumentType;
  is_placeholder_rendering: boolean;
  manual_fields_by_design: string[];
  preview_content: string;
  rendered_at: string | null;
  unresolved_placeholders: string[];
};

export type DocumentPrintPayload = {
  document_id: number;
  document_number: number;
  document_type: DocumentType;
  is_placeholder_rendering: boolean;
  print_source: string;
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  completion_act: "Заказ-наряд",
  inspection_act: "Акт приёма-передачи автомобиля",
  preliminary_work_order: "Предварительный заказ-наряд",
  work_order: "Рабочий заказ-наряд",
};

export const DOCUMENT_TYPE_SHORT_LABELS: Record<DocumentType, string> = {
  completion_act: "ЗН",
  inspection_act: "АПА",
  preliminary_work_order: "ПЗН",
  work_order: "РЗН",
};
