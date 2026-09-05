from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.audit_log import CrmAuditLog


class AuditLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, audit_log: CrmAuditLog) -> CrmAuditLog:
        self.session.add(audit_log)
        self.session.flush()
        return audit_log

    def list_by_actor(self, actor_user_id: int, *, limit: int = 200) -> list[CrmAuditLog]:
        statement = (
            select(CrmAuditLog)
            .where(CrmAuditLog.actor_user_id == actor_user_id)
            .order_by(CrmAuditLog.created_at.desc(), CrmAuditLog.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))

    def list_by_entity(self, entity_type: str, entity_id: int, *, limit: int = 200) -> list[CrmAuditLog]:
        statement = (
            select(CrmAuditLog)
            .where(CrmAuditLog.entity_type == entity_type, CrmAuditLog.entity_id == entity_id)
            .order_by(CrmAuditLog.created_at.asc(), CrmAuditLog.id.asc())
            .limit(limit)
        )
        return list(self.session.scalars(statement))
