from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.crm.schemas.common import CrmSchema


class NoteCreate(CrmSchema):
    comment: str = Field(min_length=1)
    telephone: str | None = Field(default=None, max_length=32)


class NoteRead(CrmSchema):
    id: int
    number: int
    comment: str
    created_at: datetime
    created_by_user_id: int
    created_by_user_name: str
    telephone: str | None
