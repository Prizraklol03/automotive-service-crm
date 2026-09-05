from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field, field_validator, model_validator

from app.crm.models.inspection import (
    InspectionDefectType,
    InspectionGeometryType,
    InspectionMarkStatus,
    InspectionSessionStatus,
    InspectionSeverity,
    InspectionViewType,
)
from app.crm.schemas.audit_log import AuditLogRead
from app.crm.schemas.common import CrmSchema
from app.crm.schemas.document import DocumentRead


class InspectionPointPayload(CrmSchema):
    x: float = Field(ge=0, le=1, examples=[0.42])
    y: float = Field(ge=0, le=1, examples=[0.33])


class InspectionGeometryPayload(CrmSchema):
    points: list[InspectionPointPayload] = Field(default_factory=list)


class InspectionUserMiniRead(CrmSchema):
    id: int
    full_name: str


class InspectionMarkPhotoRead(CrmSchema):
    id: int
    inspection_mark_id: int
    file_path: str
    original_name: str
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    sort_order: int
    created_at: datetime
    uploaded_by_user_id: int


class InspectionGeneralPhotoRead(CrmSchema):
    id: int
    inspection_session_id: int
    file_path: str
    original_name: str
    mime_type: str
    size_bytes: int
    width: int | None
    height: int | None
    sort_order: int
    created_at: datetime
    uploaded_by_user_id: int


class InspectionMarkRead(CrmSchema):
    id: int
    inspection_session_id: int
    order_id: int
    vehicle_id: int
    view_type: InspectionViewType
    zone_key: str | None
    geometry_type: InspectionGeometryType
    geometry_data: InspectionGeometryPayload
    defect_type: InspectionDefectType
    severity: InspectionSeverity
    status: InspectionMarkStatus
    comment: str | None
    sort_order: int
    created_by_user_id: int
    updated_by_user_id: int
    created_at: datetime
    updated_at: datetime
    photos: list[InspectionMarkPhotoRead] = Field(default_factory=list)


class InspectionExportRead(CrmSchema):
    id: int
    inspection_session_id: int
    document_id: int | None
    snapshot_json: dict[str, Any]
    export_payload_json: dict[str, Any]
    docx_path: str | None
    pdf_path: str | None
    created_at: datetime
    created_by_user_id: int


class InspectionSessionRead(CrmSchema):
    id: int
    order_id: int
    vehicle_id: int
    status: InspectionSessionStatus
    started_at: datetime | None
    completed_at: datetime | None
    confirmed_at: datetime | None
    locked_at: datetime | None
    created_by_user_id: int
    updated_by_user_id: int
    general_comment: str | None
    checklist_json: dict[str, Any] | None
    snapshot_version: int
    export_front_image_path: str | None
    export_rear_image_path: str | None
    export_left_image_path: str | None
    export_right_image_path: str | None
    export_top_image_path: str | None
    export_interior_image_path: str | None
    created_at: datetime
    updated_at: datetime
    created_by: InspectionUserMiniRead | None = None
    updated_by: InspectionUserMiniRead | None = None
    marks_count: int = 0
    mark_photos_count: int = 0
    general_photos_count: int = 0
    latest_export: InspectionExportRead | None = None


class InspectionSessionDetailRead(InspectionSessionRead):
    marks: list[InspectionMarkRead] = Field(default_factory=list)
    general_photos: list[InspectionGeneralPhotoRead] = Field(default_factory=list)


class InspectionSessionPatch(CrmSchema):
    general_comment: str | None = None
    checklist_json: dict[str, Any] | None = None
    status: InspectionSessionStatus | None = None


class InspectionMarkBasePayload(CrmSchema):
    view_type: InspectionViewType
    zone_key: str | None = Field(default=None, max_length=64)
    geometry_type: InspectionGeometryType
    geometry_data: InspectionGeometryPayload
    defect_type: InspectionDefectType
    severity: InspectionSeverity
    status: InspectionMarkStatus
    comment: str | None = None

    @model_validator(mode="after")
    def validate_geometry(self) -> "InspectionMarkBasePayload":
        points = self.geometry_data.points
        if self.geometry_type == InspectionGeometryType.POINT and len(points) != 1:
            raise ValueError("Для point нужна ровно одна точка")
        if self.geometry_type == InspectionGeometryType.LINE and len(points) < 2:
            raise ValueError("Для line нужно минимум две точки")
        if self.geometry_type == InspectionGeometryType.POLYGON and len(points) < 3:
            raise ValueError("Для polygon нужно минимум три точки")
        return self


class InspectionMarkCreatePayload(InspectionMarkBasePayload):
    sort_order: int = 0


class InspectionMarkUpdatePayload(CrmSchema):
    view_type: InspectionViewType | None = None
    zone_key: str | None = Field(default=None, max_length=64)
    geometry_type: InspectionGeometryType | None = None
    geometry_data: InspectionGeometryPayload | None = None
    defect_type: InspectionDefectType | None = None
    severity: InspectionSeverity | None = None
    status: InspectionMarkStatus | None = None
    comment: str | None = None
    sort_order: int | None = None

    @model_validator(mode="after")
    def validate_geometry(self) -> "InspectionMarkUpdatePayload":
        geometry_type = self.geometry_type
        geometry_data = self.geometry_data
        if geometry_type is None and geometry_data is None:
            return self
        if geometry_type is None or geometry_data is None:
            raise ValueError("geometry_type и geometry_data нужно передавать вместе")
        points = geometry_data.points
        if geometry_type == InspectionGeometryType.POINT and len(points) != 1:
            raise ValueError("Для point нужна ровно одна точка")
        if geometry_type == InspectionGeometryType.LINE and len(points) < 2:
            raise ValueError("Для line нужно минимум две точки")
        if geometry_type == InspectionGeometryType.POLYGON and len(points) < 3:
            raise ValueError("Для polygon нужно минимум три точки")
        return self


class InspectionMarkReorderItem(CrmSchema):
    id: int
    sort_order: int = Field(ge=0)


class InspectionMarkReorderPayload(CrmSchema):
    items: list[InspectionMarkReorderItem]

    @field_validator("items")
    @classmethod
    def validate_unique_ids(cls, items: list[InspectionMarkReorderItem]) -> list[InspectionMarkReorderItem]:
        ids = [item.id for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Идентификаторы отметок не должны повторяться")
        return items


class InspectionExportPreviewRead(CrmSchema):
    session: InspectionSessionRead
    snapshot: dict[str, Any]
    export_payload: dict[str, Any]


class InspectionActGenerateRead(CrmSchema):
    session: InspectionSessionRead
    export: InspectionExportRead
    document: DocumentRead


class InspectionHistoryRead(CrmSchema):
    items: list[AuditLogRead] = Field(default_factory=list)
