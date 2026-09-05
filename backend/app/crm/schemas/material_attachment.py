from __future__ import annotations

from datetime import datetime

from app.crm.schemas.common import CrmSchema


class MaterialAttachmentRead(CrmSchema):
    id: int
    material_id: int
    file_name: str
    mime_type: str
    size: int
    created_at: datetime
    created_by_user_id: int | None = None
