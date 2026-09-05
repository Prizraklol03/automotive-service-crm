from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.material_attachment import CrmMaterialAttachment


class MaterialAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, attachment: CrmMaterialAttachment) -> CrmMaterialAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> CrmMaterialAttachment | None:
        statement = (
            select(CrmMaterialAttachment)
            .options(selectinload(CrmMaterialAttachment.created_by_user))
            .where(CrmMaterialAttachment.id == attachment_id)
        )
        return self.session.scalar(statement)

    def list_by_material_id(self, material_id: int) -> list[CrmMaterialAttachment]:
        statement = (
            select(CrmMaterialAttachment)
            .options(selectinload(CrmMaterialAttachment.created_by_user))
            .where(CrmMaterialAttachment.material_id == material_id)
            .order_by(CrmMaterialAttachment.created_at.desc(), CrmMaterialAttachment.id.desc())
        )
        return list(self.session.scalars(statement))

    def delete(self, attachment: CrmMaterialAttachment) -> None:
        self.session.delete(attachment)
        self.session.flush()
