import enum

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class DocumentType(str, enum.Enum):
    PRELIMINARY_WORK_ORDER = "preliminary_work_order"
    WORK_ORDER = "work_order"
    COMPLETION_ACT = "completion_act"
    INSPECTION_ACT = "inspection_act"


class CrmDocumentTemplate(TimestampMixin, Base):
    __tablename__ = "crm_document_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[DocumentType] = mapped_column(
        Enum(
            DocumentType,
            native_enum=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
            validate_strings=True,
        ),
        nullable=False,
        unique=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    documents = relationship("CrmDocument", back_populates="template")
