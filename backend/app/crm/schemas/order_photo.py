from __future__ import annotations

from datetime import datetime

from app.crm.schemas.common import CrmSchema
from app.crm.models.order_photo import PhotoStage


class OrderPhotoRead(CrmSchema):
    id: int
    order_id: int
    stage: PhotoStage
    sort_order: int
    filename: str
    created_at: datetime


class PublicOrderPhotoRead(CrmSchema):
    photo_key: str
    stage: PhotoStage
    sort_order: int


class OrderShareRead(CrmSchema):
    share_token: str | None
    share_url: str | None
