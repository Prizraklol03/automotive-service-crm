from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.external_lead import CrmIntegrationSource


class IntegrationSourceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, source: CrmIntegrationSource) -> CrmIntegrationSource:
        self.session.add(source)
        self.session.flush()
        return source

    def list_active(self) -> list[CrmIntegrationSource]:
        statement = (
            select(CrmIntegrationSource)
            .where(CrmIntegrationSource.is_active.is_(True))
            .order_by(CrmIntegrationSource.id.asc())
        )
        return list(self.session.scalars(statement))
