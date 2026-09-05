from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.encrypted_types import EncryptedJson, EncryptedText

if TYPE_CHECKING:
    from app.crm.models.document import CrmDocument
    from app.crm.models.order import CrmOrder
    from app.crm.models.user import CrmUser
    from app.crm.models.vehicle import CrmVehicle


def _enum_column(enum_cls: type[enum.Enum], *, length: int = 32) -> Enum:
    return Enum(
        enum_cls,
        native_enum=False,
        values_callable=lambda values: [item.value for item in values],
        validate_strings=True,
        length=length,
    )


class InspectionSessionStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CONFIRMED = "confirmed"
    LOCKED = "locked"


class InspectionViewType(str, enum.Enum):
    FRONT = "front"
    REAR = "rear"
    LEFT = "left"
    RIGHT = "right"
    TOP = "top"
    INTERIOR = "interior"


class InspectionGeometryType(str, enum.Enum):
    POINT = "point"
    LINE = "line"
    POLYGON = "polygon"


class InspectionDefectType(str, enum.Enum):
    SCRATCH = "scratch"
    CHIP = "chip"
    CRACK = "crack"
    DENT = "dent"
    SCUFF = "scuff"
    PAINT_DAMAGE = "paint_damage"
    STAIN = "stain"
    OTHER = "other"


class InspectionSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class InspectionMarkStatus(str, enum.Enum):
    EXISTING_BEFORE_WORK = "existing_before_work"
    FOUND_DURING_WORK = "found_during_work"
    FIXED = "fixed"
    IGNORED = "ignored"


class CrmInspectionSession(TimestampMixin, Base):
    __tablename__ = "inspection_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("crm_vehicles.id", ondelete="RESTRICT"), nullable=False, index=True)
    status: Mapped[InspectionSessionStatus] = mapped_column(
        _enum_column(InspectionSessionStatus),
        nullable=False,
        default=InspectionSessionStatus.DRAFT,
        server_default=InspectionSessionStatus.DRAFT.value,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)
    updated_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)
    general_comment: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    checklist_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    snapshot_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    export_front_image_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    export_rear_image_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    export_left_image_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    export_right_image_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    export_top_image_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    export_interior_image_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    order: Mapped["CrmOrder"] = relationship("CrmOrder", back_populates="inspection_sessions")
    vehicle: Mapped["CrmVehicle"] = relationship("CrmVehicle", back_populates="inspection_sessions")
    created_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[created_by_user_id])
    updated_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[updated_by_user_id])
    marks: Mapped[list["CrmInspectionMark"]] = relationship(
        "CrmInspectionMark",
        back_populates="inspection_session",
        cascade="all, delete-orphan",
        order_by="CrmInspectionMark.sort_order, CrmInspectionMark.id",
    )
    general_photos: Mapped[list["CrmInspectionGeneralPhoto"]] = relationship(
        "CrmInspectionGeneralPhoto",
        back_populates="inspection_session",
        cascade="all, delete-orphan",
        order_by="CrmInspectionGeneralPhoto.sort_order, CrmInspectionGeneralPhoto.id",
    )
    exports: Mapped[list["CrmInspectionExport"]] = relationship(
        "CrmInspectionExport",
        back_populates="inspection_session",
        cascade="all, delete-orphan",
        order_by="CrmInspectionExport.created_at.desc(), CrmInspectionExport.id.desc()",
    )


class CrmInspectionMark(TimestampMixin, Base):
    __tablename__ = "inspection_marks"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_session_id: Mapped[int] = mapped_column(
        ForeignKey("inspection_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[int] = mapped_column(ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("crm_vehicles.id", ondelete="RESTRICT"), nullable=False, index=True)
    view_type: Mapped[InspectionViewType] = mapped_column(_enum_column(InspectionViewType), nullable=False)
    zone_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    geometry_type: Mapped[InspectionGeometryType] = mapped_column(_enum_column(InspectionGeometryType), nullable=False)
    geometry_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    defect_type: Mapped[InspectionDefectType] = mapped_column(_enum_column(InspectionDefectType), nullable=False)
    severity: Mapped[InspectionSeverity] = mapped_column(_enum_column(InspectionSeverity), nullable=False)
    status: Mapped[InspectionMarkStatus] = mapped_column(_enum_column(InspectionMarkStatus), nullable=False)
    comment: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)
    updated_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)

    inspection_session: Mapped["CrmInspectionSession"] = relationship("CrmInspectionSession", back_populates="marks")
    created_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[created_by_user_id])
    updated_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[updated_by_user_id])
    photos: Mapped[list["CrmInspectionMarkPhoto"]] = relationship(
        "CrmInspectionMarkPhoto",
        back_populates="inspection_mark",
        cascade="all, delete-orphan",
        order_by="CrmInspectionMarkPhoto.sort_order, CrmInspectionMarkPhoto.id",
    )


class CrmInspectionMarkPhoto(TimestampMixin, Base):
    __tablename__ = "inspection_mark_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_mark_id: Mapped[int] = mapped_column(
        ForeignKey("inspection_marks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    uploaded_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)

    inspection_mark: Mapped["CrmInspectionMark"] = relationship("CrmInspectionMark", back_populates="photos")
    uploaded_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[uploaded_by_user_id])


class CrmInspectionGeneralPhoto(TimestampMixin, Base):
    __tablename__ = "inspection_general_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_session_id: Mapped[int] = mapped_column(
        ForeignKey("inspection_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    uploaded_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)

    inspection_session: Mapped["CrmInspectionSession"] = relationship("CrmInspectionSession", back_populates="general_photos")
    uploaded_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[uploaded_by_user_id])


class CrmInspectionExport(TimestampMixin, Base):
    __tablename__ = "inspection_exports"
    __table_args__ = (UniqueConstraint("document_id", name="uq_inspection_exports_document_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    inspection_session_id: Mapped[int] = mapped_column(
        ForeignKey("inspection_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[int | None] = mapped_column(ForeignKey("crm_documents.id", ondelete="SET NULL"), nullable=True)
    snapshot_json: Mapped[dict] = mapped_column(EncryptedJson(), nullable=False)
    export_payload_json: Mapped[dict] = mapped_column(EncryptedJson(), nullable=False)
    docx_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)

    inspection_session: Mapped["CrmInspectionSession"] = relationship("CrmInspectionSession", back_populates="exports")
    document: Mapped["CrmDocument | None"] = relationship("CrmDocument")
    created_by: Mapped["CrmUser"] = relationship("CrmUser", foreign_keys=[created_by_user_id])
