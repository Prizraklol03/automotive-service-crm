from datetime import datetime
from pydantic import Field

from app.crm.models.document_template import DocumentType
from app.crm.schemas.common import CrmSchema
from app.crm.schemas.order import OrderClientSummaryRead, OrderVehicleSummaryRead


class DocumentTemplateRead(CrmSchema):
    id: int
    code: DocumentType
    name: str
    storage_path: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DocumentFileRead(CrmSchema):
    exists: bool
    storage_path: str | None
    filename: str | None
    mime_type: str


class DocumentPreviewRead(CrmSchema):
    document_id: int
    document_type: DocumentType
    document_number: int
    preview_content: str
    is_placeholder_rendering: bool
    rendered_at: datetime | None
    unresolved_placeholders: list[str] = []
    manual_fields_by_design: list[str] = []


class DocumentPrintRead(CrmSchema):
    document_id: int
    document_type: DocumentType
    document_number: int
    print_source: str
    is_placeholder_rendering: bool


class DocumentOrderSummaryRead(CrmSchema):
    id: int
    client_summary: OrderClientSummaryRead
    vehicle_summary: OrderVehicleSummaryRead


class DocumentWorkDatesUpdate(CrmSchema):
    work_started_at: datetime = Field()
    work_completed_at: datetime | None = None


class DocumentRead(CrmSchema):
    id: int
    order_id: int
    order_summary: DocumentOrderSummaryRead
    template_id: int
    created_by_user_id: int
    document_type: DocumentType
    document_number: int
    work_started_at: datetime
    work_completed_at: datetime | None
    storage_docx_path: str | None
    storage_pdf_path: str | None
    last_pdf_engine: str | None = None
    last_pdf_generation_note: str | None = None
    created_at: datetime
    updated_at: datetime
    last_rendered_at: datetime | None
    template: DocumentTemplateRead
    docx_file: DocumentFileRead
    pdf_file: DocumentFileRead
    unresolved_placeholders: list[str] = []
    manual_fields_by_design: list[str] = []
