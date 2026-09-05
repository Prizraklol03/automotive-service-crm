from datetime import datetime

from app.crm.schemas.common import CrmSchema


class AuditLogRead(CrmSchema):
    id: int
    actor_user_id: int
    entity_type: str
    entity_id: int | None
    action: str
    title: str
    description: str | None
    created_at: datetime
