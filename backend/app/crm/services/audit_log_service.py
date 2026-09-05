from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.request_context import get_request_ip_prefix, get_request_user_agent_hash
from app.core.text import repair_mojibake_text
from app.crm.models.audit_log import CrmAuditLog
from app.crm.repositories.audit_log_repository import AuditLogRepository
from app.crm.repositories.user_repository import UserRepository
from app.crm.schemas.audit_log import AuditLogRead


class AuditLogService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.audit_logs = AuditLogRepository(session)
        self.users = UserRepository(session)

    def record(
        self,
        *,
        actor_user_id: int | None,
        entity_type: str,
        entity_id: int | None,
        action: str,
        title: str,
        description: str | None = None,
        metadata_json: dict | None = None,
    ) -> None:
        if actor_user_id is not None and not self.users.get_by_id(actor_user_id):
            return

        self.audit_logs.create(
            CrmAuditLog(
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                title=title,
                description=description,
                ip_prefix=get_request_ip_prefix(),
                user_agent_hash=get_request_user_agent_hash(),
                metadata_json=metadata_json,
            )
        )

    def list_by_actor(self, actor_user_id: int, *, limit: int = 200) -> list[AuditLogRead]:
        return [
            AuditLogRead.model_validate(
                {
                    **item.__dict__,
                    "title": repair_mojibake_text(item.title),
                    "description": repair_mojibake_text(item.description),
                }
            )
            for item in self.audit_logs.list_by_actor(actor_user_id, limit=limit)
        ]
