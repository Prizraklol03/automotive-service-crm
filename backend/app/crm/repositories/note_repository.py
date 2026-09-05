from __future__ import annotations

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.note import CrmNote


class NoteRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, note: CrmNote) -> CrmNote:
        self.session.add(note)
        self.session.flush()
        return note

    def get_by_id(self, note_id: int) -> CrmNote | None:
        statement = (
            select(CrmNote)
            .options(selectinload(CrmNote.created_by))
            .where(CrmNote.id == note_id)
        )
        return self.session.scalar(statement)

    def list_all(self, search: str | None = None) -> list[CrmNote]:
        statement = select(CrmNote).options(selectinload(CrmNote.created_by))
        normalized_search = (search or "").strip()
        if normalized_search:
            statement = statement.where(
                or_(
                    CrmNote.telephone.like(f"%{normalized_search}%"),
                    cast(CrmNote.id, String).like(f"%{normalized_search}%"),
                )
            )
        statement = statement.order_by(CrmNote.created_at.desc(), CrmNote.id.desc())
        return list(self.session.scalars(statement))

    def delete(self, note: CrmNote) -> None:
        self.session.delete(note)
        self.session.flush()
