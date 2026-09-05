from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.crm.models.user_session import CrmUserSession


class UserSessionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, user_session: CrmUserSession) -> CrmUserSession:
        self.session.add(user_session)
        self.session.flush()
        return user_session

    def get_by_id(self, session_id: int) -> CrmUserSession | None:
        return self.session.get(CrmUserSession, session_id)

    def list_by_user_id(self, user_id: int) -> list[CrmUserSession]:
        statement = select(CrmUserSession).where(CrmUserSession.user_id == user_id).order_by(CrmUserSession.created_at.desc(), CrmUserSession.id.desc())
        return list(self.session.scalars(statement))

    def list_active_by_user_id(self, user_id: int, *, now: datetime) -> list[CrmUserSession]:
        statement = (
            select(CrmUserSession)
            .where(
                CrmUserSession.user_id == user_id,
                CrmUserSession.revoked_at.is_(None),
                CrmUserSession.expires_at > now,
                CrmUserSession.absolute_expires_at > now,
            )
            .order_by(CrmUserSession.last_used_at.desc(), CrmUserSession.id.desc())
        )
        return list(self.session.scalars(statement))

    def get_active_by_family_id(self, token_family_id: str, *, now: datetime) -> CrmUserSession | None:
        statement = (
            select(CrmUserSession)
            .where(
                CrmUserSession.token_family_id == token_family_id,
                CrmUserSession.revoked_at.is_(None),
                CrmUserSession.expires_at > now,
                CrmUserSession.absolute_expires_at > now,
            )
            .order_by(CrmUserSession.last_used_at.desc(), CrmUserSession.id.desc())
        )
        return self.session.scalar(statement)

    def list_family_members(self, token_family_id: str) -> list[CrmUserSession]:
        statement = (
            select(CrmUserSession)
            .where(CrmUserSession.token_family_id == token_family_id)
            .order_by(CrmUserSession.created_at.asc(), CrmUserSession.id.asc())
        )
        return list(self.session.scalars(statement))
