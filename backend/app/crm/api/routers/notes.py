from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user
from app.crm.schemas.note import NoteCreate, NoteRead
from app.crm.services.note_service import NoteService

router = APIRouter()


def _to_read_model(note) -> NoteRead:
    return NoteRead(
        id=note.id,
        number=note.id,
        comment=note.comment,
        created_at=note.created_at,
        created_by_user_id=note.created_by_user_id,
        created_by_user_name=note.created_by.full_name,
        telephone=note.telephone,
    )


@router.get("", response_model=list[NoteRead])
def list_notes(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[NoteRead]:
    return [_to_read_model(item) for item in NoteService(db).list_all(q)]


@router.get("/{note_id}", response_model=NoteRead)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> NoteRead:
    return _to_read_model(NoteService(db).get(note_id))


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> NoteRead:
    return _to_read_model(NoteService(db).create(payload, actor_user_id=current_user.user.id))


@router.put("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: int,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> NoteRead:
    return _to_read_model(NoteService(db).update(note_id, payload, actor_user_id=current_user.user.id))


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> Response:
    NoteService(db).delete(note_id, actor_user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
