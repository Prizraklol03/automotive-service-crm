from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time import app_now_naive, to_app_naive
from app.crm.models.reminder import CrmReminder, ReminderStatus, ReminderTargetType
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.order_repository import OrderRepository
from app.crm.repositories.reminder_repository import ReminderRepository
from app.crm.repositories.user_repository import UserRepository
from app.crm.repositories.vehicle_repository import VehicleRepository
from app.crm.schemas.reminder import (
    NotificationRead,
    NotificationsSummaryRead,
    ReminderCreate,
    ReminderManagerCreate,
    ReminderRead,
    ReminderTargetSummaryRead,
    ReminderUpdate,
)
from app.crm.services.audit_log_service import AuditLogService


class ReminderService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.reminders = ReminderRepository(session)
        self.clients = ClientRepository(session)
        self.orders = OrderRepository(session)
        self.users = UserRepository(session)
        self.vehicles = VehicleRepository(session)
        self.audit_logs = AuditLogService(session)

    def _now(self) -> datetime:
        return app_now_naive()

    def _to_local_naive(self, value: datetime) -> datetime:
        return to_app_naive(value)

    def _ensure_user(self, user_id: int) -> None:
        if not self.users.get_by_id(user_id):
            raise AppError(code="not_found", message="Пользователь не найден", status_code=404)

    def _normalize_target(
        self, target_type: ReminderTargetType | None, target_id: int | None
    ) -> tuple[ReminderTargetType, int]:
        if target_type in (None, ReminderTargetType.STANDALONE):
            return ReminderTargetType.STANDALONE, 0
        return target_type, int(target_id or 0)

    def _validate_target(self, target_type: ReminderTargetType, target_id: int) -> None:
        if target_type == ReminderTargetType.STANDALONE:
            return
        if target_type == ReminderTargetType.CLIENT:
            if not self.clients.get_by_id(target_id):
                raise AppError(code="not_found", message="Клиент не найден", status_code=404)
            return
        if target_type == ReminderTargetType.ORDER:
            if not self.orders.get_by_id(target_id):
                raise AppError(code="not_found", message="Заказ не найден", status_code=404)
            return
        if target_type == ReminderTargetType.VEHICLE:
            if not self.vehicles.get_by_id(target_id):
                raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
            return
        raise AppError(code="validation_error", message="Некорректный тип цели напоминания", status_code=422)

    def _target_summary(self, target_type: ReminderTargetType, target_id: int) -> ReminderTargetSummaryRead:
        if target_type == ReminderTargetType.STANDALONE:
            return ReminderTargetSummaryRead(
                target_type=target_type,
                target_id=0,
                title="Личное напоминание",
                subtitle=None,
            )

        if target_type == ReminderTargetType.CLIENT:
            client = self.clients.get_by_id(target_id)
            if not client:
                raise AppError(code="not_found", message="Клиент не найден", status_code=404)
            return ReminderTargetSummaryRead(
                target_type=target_type,
                target_id=target_id,
                title=client.full_name,
                subtitle=client.phone_display,
            )

        if target_type == ReminderTargetType.VEHICLE:
            vehicle = self.vehicles.get_by_id(target_id)
            if not vehicle:
                raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
            return ReminderTargetSummaryRead(
                target_type=target_type,
                target_id=target_id,
                title=vehicle.plate_number_display,
                subtitle=" • ".join(
                    [part for part in [vehicle.brand, vehicle.model, vehicle.client.full_name] if part]
                ),
            )

        order = self.orders.get_by_id(target_id)
        if not order:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        return ReminderTargetSummaryRead(
            target_type=target_type,
            target_id=target_id,
            title=f"Заказ #{order.id}",
            subtitle=" • ".join(
                [part for part in [order.client.full_name, order.vehicle.plate_number_display] if part]
            ),
        )

    def _effective_due_at(self, reminder: CrmReminder) -> datetime:
        return reminder.postpone_until or reminder.due_at

    def _effective_status(self, reminder: CrmReminder, now: datetime) -> str:
        if reminder.status == ReminderStatus.DONE:
            return ReminderStatus.DONE.value
        if reminder.status == ReminderStatus.EXPIRED:
            return ReminderStatus.EXPIRED.value
        effective_due = self._effective_due_at(reminder)
        if reminder.status == ReminderStatus.POSTPONED and effective_due > now:
            return ReminderStatus.POSTPONED.value
        if effective_due < now:
            return "overdue"
        return ReminderStatus.ACTIVE.value

    def _to_read(self, reminder: CrmReminder, *, now: datetime | None = None) -> ReminderRead:
        current_time = now or self._now()
        effective_due = self._effective_due_at(reminder)
        return ReminderRead(
            id=reminder.id,
            target_type=reminder.target_type,
            target_id=reminder.target_id,
            text=reminder.text,
            due_at=reminder.due_at,
            status=reminder.status,
            postpone_until=reminder.postpone_until,
            repeat_rule=reminder.repeat_rule,
            completed_at=reminder.completed_at,
            created_by_user_id=reminder.created_by_user_id,
            created_at=reminder.created_at,
            updated_at=reminder.updated_at,
            effective_status=self._effective_status(reminder, current_time),
            is_overdue=reminder.status not in [ReminderStatus.DONE, ReminderStatus.EXPIRED]
            and effective_due < current_time,
            target_summary=self._target_summary(reminder.target_type, reminder.target_id),
        )

    def _to_notification(self, reminder: CrmReminder, *, now: datetime | None = None) -> NotificationRead:
        reminder_read = self._to_read(reminder, now=now)
        return NotificationRead(
            id=reminder_read.id,
            reminder_id=reminder_read.id,
            text=reminder_read.text,
            due_at=reminder_read.due_at,
            effective_status=reminder_read.effective_status,
            is_overdue=reminder_read.is_overdue,
            repeat_rule=reminder_read.repeat_rule,
            status=reminder_read.status,
            postpone_until=reminder_read.postpone_until,
            target_summary=reminder_read.target_summary,
            completed_at=reminder_read.completed_at,
        )

    def create(
        self, target_type: ReminderTargetType, target_id: int, payload: ReminderCreate, created_by_user_id: int
    ) -> ReminderRead:
        return self.create_manager(
            ReminderManagerCreate(
                due_at=payload.due_at,
                repeat_rule=payload.repeat_rule,
                target_id=target_id,
                target_type=target_type,
                text=payload.text,
            ),
            created_by_user_id,
        )

    def create_manager(self, payload: ReminderManagerCreate, created_by_user_id: int) -> ReminderRead:
        target_type, target_id = self._normalize_target(payload.target_type, payload.target_id)
        self._validate_target(target_type, target_id)
        self._ensure_user(created_by_user_id)
        now = self._now()
        reminder = CrmReminder(
            target_type=target_type,
            target_id=target_id,
            text=payload.text.strip(),
            due_at=self._to_local_naive(payload.due_at),
            status=ReminderStatus.ACTIVE,
            repeat_rule=payload.repeat_rule.strip() if payload.repeat_rule else None,
            created_by_user_id=created_by_user_id,
            created_at=now,
            updated_at=now,
        )
        self.reminders.create(reminder)
        self.audit_logs.record(
            actor_user_id=created_by_user_id,
            entity_type="reminder",
            entity_id=reminder.id,
            action="create",
            title="Создано напоминание",
            description=payload.text.strip(),
        )
        self.session.commit()
        return self.get(reminder.id)

    def update(self, reminder_id: int, payload: ReminderUpdate, *, actor_user_id: int | None = None) -> ReminderRead:
        reminder = self.reminders.get_by_id(reminder_id)
        if not reminder:
            raise AppError(code="not_found", message="Напоминание не найдено", status_code=404)
        target_type, target_id = self._normalize_target(payload.target_type, payload.target_id)
        self._validate_target(target_type, target_id)
        reminder.target_type = target_type
        reminder.target_id = target_id
        reminder.text = payload.text.strip()
        reminder.due_at = self._to_local_naive(payload.due_at)
        reminder.repeat_rule = payload.repeat_rule.strip() if payload.repeat_rule else None
        reminder.updated_at = self._now()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="reminder",
            entity_id=reminder.id,
            action="update",
            title="Обновлено напоминание",
            description=reminder.text,
        )
        self.session.commit()
        return self.get(reminder_id)

    def get(self, reminder_id: int) -> ReminderRead:
        reminder = self.reminders.get_by_id(reminder_id)
        if not reminder:
            raise AppError(code="not_found", message="Напоминание не найдено", status_code=404)
        return self._to_read(reminder)

    def list_by_target(self, target_type: ReminderTargetType, target_id: int) -> list[ReminderRead]:
        self._validate_target(target_type, target_id)
        now = self._now()
        return [self._to_read(reminder, now=now) for reminder in self.reminders.list_by_target(target_type, target_id)]

    def list_notifications(self, scope: str) -> list[NotificationRead]:
        now = self._now()
        normalized_scope = scope.lower()
        if normalized_scope in {"active", "due"}:
            reminders = self.reminders.list_due(now)
        elif normalized_scope == "scheduled":
            reminders = self.reminders.list_scheduled(now)
        elif normalized_scope == "history":
            reminders = self.reminders.list_history()
        elif normalized_scope == "all":
            reminders = self.reminders.list_all_visible()
        else:
            raise AppError(code="validation_error", message="Некорректная область уведомлений", status_code=422)
        return [self._to_notification(reminder, now=now) for reminder in reminders]

    def get_notifications_summary(self) -> NotificationsSummaryRead:
        now = self._now()
        return NotificationsSummaryRead.model_validate(self.reminders.count_summary(now))

    def postpone(self, reminder_id: int, postpone_until: datetime, *, actor_user_id: int | None = None) -> ReminderRead:
        reminder = self.reminders.get_by_id(reminder_id)
        if not reminder:
            raise AppError(code="not_found", message="Напоминание не найдено", status_code=404)
        if reminder.status == ReminderStatus.DONE:
            raise AppError(code="conflict", message="Завершённое напоминание нельзя перенести", status_code=409)
        reminder.postpone_until = self._to_local_naive(postpone_until)
        reminder.status = ReminderStatus.POSTPONED
        reminder.updated_at = self._now()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="reminder",
            entity_id=reminder.id,
            action="postpone",
            title="Перенесено напоминание",
            description=reminder.text,
        )
        self.session.commit()
        return self.get(reminder_id)

    def update_repeat_rule(self, reminder_id: int, repeat_rule: str | None, *, actor_user_id: int | None = None) -> ReminderRead:
        reminder = self.reminders.get_by_id(reminder_id)
        if not reminder:
            raise AppError(code="not_found", message="Напоминание не найдено", status_code=404)
        if reminder.status == ReminderStatus.DONE:
            raise AppError(code="conflict", message="Нельзя изменить повтор у завершённого напоминания", status_code=409)
        reminder.repeat_rule = repeat_rule.strip() if repeat_rule else None
        reminder.updated_at = self._now()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="reminder",
            entity_id=reminder.id,
            action="repeat",
            title="Обновлено правило повтора напоминания",
            description=reminder.text,
        )
        self.session.commit()
        return self.get(reminder_id)

    def mark_done(
        self,
        reminder_id: int,
        completed_at: datetime | None = None,
        *,
        actor_user_id: int | None = None,
    ) -> ReminderRead:
        reminder = self.reminders.get_by_id(reminder_id)
        if not reminder:
            raise AppError(code="not_found", message="Напоминание не найдено", status_code=404)
        reminder.status = ReminderStatus.DONE
        reminder.completed_at = self._to_local_naive(completed_at) if completed_at else self._now()
        reminder.updated_at = self._now()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="reminder",
            entity_id=reminder.id,
            action="done",
            title="Выполнено напоминание",
            description=reminder.text,
        )
        self.session.commit()
        return self.get(reminder_id)

    def delete(self, reminder_id: int, *, actor_user_id: int | None = None) -> ReminderRead:
        reminder = self.reminders.get_by_id(reminder_id)
        if not reminder:
            raise AppError(code="not_found", message="Напоминание не найдено", status_code=404)
        deleted_snapshot = self._to_read(reminder)
        self.reminders.delete(reminder)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="reminder",
            entity_id=reminder.id,
            action="delete",
            title="Удалено напоминание",
            description=reminder.text,
        )
        self.session.commit()
        return deleted_snapshot
