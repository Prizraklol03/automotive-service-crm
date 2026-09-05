from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.crm.models.document_template import DocumentType
from app.db.base import Base, TimestampMixin


class CrmDocument(TimestampMixin, Base):
    __tablename__ = "crm_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("crm_orders.id", ondelete="RESTRICT"), nullable=False)
    template_id: Mapped[int] = mapped_column(ForeignKey("crm_document_templates.id", ondelete="RESTRICT"), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False)
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(
            DocumentType,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
    )
    document_number: Mapped[int] = mapped_column(Integer, nullable=False)
    work_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    work_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    storage_docx_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    storage_pdf_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    last_pdf_engine: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_pdf_generation_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_rendered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    order = relationship("CrmOrder", back_populates="documents")
    template = relationship("CrmDocumentTemplate", back_populates="documents")
    created_by = relationship("CrmUser", back_populates="created_documents")
