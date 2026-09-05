from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.time import app_now_naive
from app.crm.models.user_session import CrmUserSession


@dataclass(slots=True)
class SessionCleanupResult:
    retention_days: int
    dry_run: bool
    candidate_count: int
    deleted_count: int
    cutoff: str

    def as_dict(self) -> dict[str, object]:
        return {
            "retention_days": self.retention_days,
            "dry_run": self.dry_run,
            "candidate_count": self.candidate_count,
            "deleted_count": self.deleted_count,
            "cutoff": self.cutoff,
        }


class SessionHousekeepingService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def purge_stale_sessions(self, *, retention_days: int = 30, dry_run: bool = False) -> SessionCleanupResult:
        cutoff = app_now_naive() - timedelta(days=retention_days)
        predicate = or_(
            CrmUserSession.revoked_at <= cutoff,
            CrmUserSession.absolute_expires_at <= cutoff,
        )
        count_statement = select(func.count()).select_from(CrmUserSession).where(predicate)
        candidate_count = int(self.session.scalar(count_statement) or 0)

        deleted_count = 0
        if not dry_run and candidate_count:
            deleted_count = self.session.execute(delete(CrmUserSession).where(predicate)).rowcount or 0
            self.session.commit()

        return SessionCleanupResult(
            retention_days=retention_days,
            dry_run=dry_run,
            candidate_count=candidate_count,
            deleted_count=0 if dry_run else deleted_count,
            cutoff=cutoff.isoformat(),
        )
