from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user
from app.crm.schemas.reminder import NotificationRead, NotificationsSummaryRead
from app.crm.services.reminder_service import ReminderService

router = APIRouter()


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    scope: str = Query(default="due"),
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[NotificationRead]:
    return ReminderService(db).list_notifications(scope)


@router.get("/summary", response_model=NotificationsSummaryRead)
def notifications_summary(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> NotificationsSummaryRead:
    return ReminderService(db).get_notifications_summary()


@router.get("/history", response_model=list[NotificationRead])
def list_notification_history(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[NotificationRead]:
    return ReminderService(db).list_notifications("history")
