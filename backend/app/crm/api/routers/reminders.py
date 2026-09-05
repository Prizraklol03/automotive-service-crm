from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user
from app.crm.models.reminder import ReminderTargetType
from app.crm.schemas.reminder import (
    ReminderCreate,
    ReminderDoneUpdate,
    ReminderManagerCreate,
    ReminderPostponeUpdate,
    ReminderRead,
    ReminderRepeatUpdate,
    ReminderUpdate,
)
from app.crm.services.reminder_service import ReminderService

router = APIRouter()


@router.post("/reminders", response_model=ReminderRead, status_code=status.HTTP_201_CREATED)
def create_reminder(
    payload: ReminderManagerCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).create_manager(payload, current_user.user.id)


@router.post("/clients/{client_id}/reminders", response_model=ReminderRead, status_code=status.HTTP_201_CREATED)
def create_client_reminder(
    client_id: int,
    payload: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).create(ReminderTargetType.CLIENT, client_id, payload, current_user.user.id)


@router.get("/clients/{client_id}/reminders", response_model=list[ReminderRead])
def list_client_reminders(
    client_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[ReminderRead]:
    return ReminderService(db).list_by_target(ReminderTargetType.CLIENT, client_id)


@router.post("/orders/{order_id}/reminders", response_model=ReminderRead, status_code=status.HTTP_201_CREATED)
def create_order_reminder(
    order_id: int,
    payload: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).create(ReminderTargetType.ORDER, order_id, payload, current_user.user.id)


@router.get("/orders/{order_id}/reminders", response_model=list[ReminderRead])
def list_order_reminders(
    order_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[ReminderRead]:
    return ReminderService(db).list_by_target(ReminderTargetType.ORDER, order_id)


@router.get("/reminders/{reminder_id}", response_model=ReminderRead)
def get_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).get(reminder_id)


@router.patch("/reminders/{reminder_id}", response_model=ReminderRead)
def update_reminder(
    reminder_id: int,
    payload: ReminderUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).update(reminder_id, payload, actor_user_id=current_user.user.id)


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> Response:
    ReminderService(db).delete(reminder_id, actor_user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/reminders/{reminder_id}/postpone", response_model=ReminderRead)
def postpone_reminder(
    reminder_id: int,
    payload: ReminderPostponeUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).postpone(reminder_id, payload.postpone_until, actor_user_id=current_user.user.id)


@router.patch("/reminders/{reminder_id}/repeat", response_model=ReminderRead)
def update_reminder_repeat(
    reminder_id: int,
    payload: ReminderRepeatUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).update_repeat_rule(reminder_id, payload.repeat_rule, actor_user_id=current_user.user.id)


@router.patch("/reminders/{reminder_id}/done", response_model=ReminderRead)
def mark_reminder_done(
    reminder_id: int,
    payload: ReminderDoneUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> ReminderRead:
    return ReminderService(db).mark_done(reminder_id, payload.completed_at, actor_user_id=current_user.user.id)
