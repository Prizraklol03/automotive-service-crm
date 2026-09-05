from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_roles
from app.crm.schemas.preset import PresetApplyResult, PresetRead
from app.crm.services.preset_service import PresetService

router = APIRouter()


@router.get("/presets", response_model=list[PresetRead])
def list_presets(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> list[PresetRead]:
    return PresetService(db).list_presets()


@router.post("/presets/{name}/apply", response_model=PresetApplyResult)
def apply_preset(
    name: str,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> PresetApplyResult:
    return PresetService(db).apply_preset(name)
