from __future__ import annotations

from datetime import datetime

from sqlalchemy import asc, case, desc, func, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.reminder import CrmReminder, ReminderStatus, ReminderTargetType
from app.crm.models.user import CrmUser


class ReminderRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, reminder: CrmReminder) -> CrmReminder:
        self.session.add(reminder)
        self.session.flush()
        return reminder

    def get_by_id(self, reminder_id: int) -> CrmReminder | None:
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .where(CrmReminder.id == reminder_id)
        )
        return self.session.scalar(statement)

    def list_by_target(self, target_type: ReminderTargetType, target_id: int) -> list[CrmReminder]:
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .where(
                CrmReminder.target_type == target_type,
                CrmReminder.target_id == target_id,
            )
            .order_by(desc(CrmReminder.created_at), desc(CrmReminder.id))
        )
        return list(self.session.scalars(statement))

    def list_active_by_target(self, target_type: ReminderTargetType, target_id: int, now: datetime) -> list[CrmReminder]:
        effective_due = case(
            (CrmReminder.postpone_until.is_not(None), CrmReminder.postpone_until),
            else_=CrmReminder.due_at,
        )
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .where(
                CrmReminder.target_type == target_type,
                CrmReminder.target_id == target_id,
                CrmReminder.status != ReminderStatus.DONE,
                effective_due <= now,
            )
            .order_by(asc(effective_due), asc(CrmReminder.id))
        )
        return list(self.session.scalars(statement))

    def list_due(self, now: datetime) -> list[CrmReminder]:
        effective_due = case(
            (CrmReminder.postpone_until.is_not(None), CrmReminder.postpone_until),
            else_=CrmReminder.due_at,
        )
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .where(CrmReminder.status != ReminderStatus.DONE, effective_due <= now)
            .order_by(asc(effective_due), asc(CrmReminder.id))
        )
        return list(self.session.scalars(statement))

    def list_scheduled(self, now: datetime) -> list[CrmReminder]:
        effective_due = case(
            (CrmReminder.postpone_until.is_not(None), CrmReminder.postpone_until),
            else_=CrmReminder.due_at,
        )
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .where(CrmReminder.status != ReminderStatus.DONE, effective_due > now)
            .order_by(asc(effective_due), asc(CrmReminder.id))
        )
        return list(self.session.scalars(statement))

    def list_history(self) -> list[CrmReminder]:
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .where(
                CrmReminder.status.in_([ReminderStatus.DONE, ReminderStatus.EXPIRED]),
            )
            .order_by(desc(CrmReminder.updated_at), desc(CrmReminder.id))
        )
        return list(self.session.scalars(statement))

    def list_all_visible(self) -> list[CrmReminder]:
        statement = (
            select(CrmReminder)
            .options(selectinload(CrmReminder.created_by).selectinload(CrmUser.role))
            .order_by(desc(CrmReminder.created_at), desc(CrmReminder.id))
        )
        return list(self.session.scalars(statement))

    def count_summary(self, now: datetime) -> dict[str, int]:
        effective_due = case(
            (CrmReminder.postpone_until.is_not(None), CrmReminder.postpone_until),
            else_=CrmReminder.due_at,
        )
        due_count = int(
            self.session.scalar(
                select(func.count()).select_from(CrmReminder).where(
                    CrmReminder.status != ReminderStatus.DONE,
                    effective_due <= now,
                )
            )
            or 0
        )
        scheduled_count = int(
            self.session.scalar(
                select(func.count()).select_from(CrmReminder).where(
                    CrmReminder.status != ReminderStatus.DONE,
                    effective_due > now,
                )
            )
            or 0
        )
        history_count = int(
            self.session.scalar(
                select(func.count()).select_from(CrmReminder).where(
                    CrmReminder.status.in_([ReminderStatus.DONE, ReminderStatus.EXPIRED]),
                )
            )
            or 0
        )
        all_count = int(self.session.scalar(select(func.count()).select_from(CrmReminder)) or 0)
        return {
            "all": all_count,
            "due": due_count,
            "history": history_count,
            "scheduled": scheduled_count,
        }

    def delete(self, reminder: CrmReminder) -> None:
        self.session.delete(reminder)
