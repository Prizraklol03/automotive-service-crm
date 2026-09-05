from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.note import CrmNote
from app.crm.repositories.note_repository import NoteRepository
from app.crm.repositories.user_repository import UserRepository
from app.crm.schemas.note import NoteCreate
from app.crm.services.audit_log_service import AuditLogService


class NoteService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.notes = NoteRepository(session)
        self.users = UserRepository(session)
        self.audit_logs = AuditLogService(session)

    def _get_user(self, user_id: int):
        user = self.users.get_by_id(user_id)
        if not user:
            raise AppError(code="not_found", message="Пользователь не найден", status_code=404)
        return user

    def create(self, payload: NoteCreate, *, actor_user_id: int) -> CrmNote:
        user = self._get_user(actor_user_id)
        note = CrmNote(
            comment=payload.comment.strip(),
            created_by_user_id=user.id,
            telephone=payload.telephone.strip() if payload.telephone else None,
        )
        self.notes.create(note)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="note",
            entity_id=note.id,
            action="create",
            title=f"Создана заметка #{note.id}",
            description=note.comment[:200],
        )
        self.session.commit()
        return self.get(note.id)

    def get(self, note_id: int) -> CrmNote:
        note = self.notes.get_by_id(note_id)
        if not note:
            raise AppError(code="not_found", message="Заметка не найдена", status_code=404)
        return note

    def list_all(self, search: str | None = None) -> list[CrmNote]:
        return self.notes.list_all(search)

    def update(self, note_id: int, payload: NoteCreate, *, actor_user_id: int) -> CrmNote:
        note = self.get(note_id)
        note.comment = payload.comment.strip()
        note.telephone = payload.telephone.strip() if payload.telephone else None
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="note",
            entity_id=note.id,
            action="update",
            title=f"Обновлена заметка #{note.id}",
            description=note.comment[:200],
        )
        self.session.commit()
        return self.get(note.id)

    def delete(self, note_id: int, *, actor_user_id: int) -> None:
        note = self.get(note_id)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="note",
            entity_id=note.id,
            action="delete",
            title=f"Удалена заметка #{note.id}",
            description=note.comment[:200],
        )
        self.notes.delete(note)
        self.session.commit()
