from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_roles
from app.crm.api.deps import get_current_user
from app.crm.models.document_template import DocumentType
from app.crm.schemas.document import DocumentTemplateRead
from app.crm.schemas.settings import (
    ModulesConfig,
    SettingsRead,
    UserPreferencesRead,
    UserPreferencesUpdate,
    VehicleCatalogStatusRead,
    VehicleCatalogSyncRead,
    VisualConfig,
)
from app.crm.services.document_template_service import DocumentTemplateService
from app.crm.services.settings_service import SettingsService

router = APIRouter()


@router.get("/me/preferences", response_model=UserPreferencesRead)
def get_my_preferences(
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> UserPreferencesRead:
    return SettingsService(db).get_user_preferences(current_user.user.id)


@router.put("/me/preferences", response_model=UserPreferencesRead)
def update_my_preferences(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(get_current_user),
) -> UserPreferencesRead:
    return SettingsService(db).update_user_preferences(current_user.user.id, payload)


@router.get("/modules", response_model=ModulesConfig)
def get_modules(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> ModulesConfig:
    return SettingsService(db).get_modules()


@router.put("/modules", response_model=ModulesConfig)
def update_modules(
    payload: ModulesConfig,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> ModulesConfig:
    return SettingsService(db).update_modules(payload)


@router.get("/visual", response_model=VisualConfig)
def get_visual_config(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(get_current_user),
) -> VisualConfig:
    return SettingsService(db).get_visual_config()


@router.put("/visual", response_model=VisualConfig)
def update_visual_config(
    payload: VisualConfig,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> VisualConfig:
    return SettingsService(db).update_visual_config(payload)


@router.get("", response_model=SettingsRead)
def get_settings(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> SettingsRead:
    return SettingsRead.model_validate(SettingsService(db).get_settings_payload())


@router.get("/vehicle-catalog", response_model=VehicleCatalogStatusRead)
def get_vehicle_catalog_status(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> VehicleCatalogStatusRead:
    return VehicleCatalogStatusRead.model_validate(SettingsService(db).get_vehicle_catalog_status_payload())


@router.post("/vehicle-catalog/sync", response_model=VehicleCatalogSyncRead)
def sync_vehicle_catalog(
    replace: bool = False,
    dry_run: bool = False,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> VehicleCatalogSyncRead:
    return VehicleCatalogSyncRead.model_validate(SettingsService(db).run_vehicle_catalog_sync(replace=replace, dry_run=dry_run))


@router.get("/document-templates", response_model=list[DocumentTemplateRead])
def list_document_templates(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> list[DocumentTemplateRead]:
    return [DocumentTemplateRead.model_validate(template) for template in DocumentTemplateService(db).list_all()]


@router.post("/document-templates/{document_type}", response_model=DocumentTemplateRead)
async def upload_document_template(
    document_type: DocumentType,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_roles("admin")),
) -> DocumentTemplateRead:
    content = await file.read()
    template = DocumentTemplateService(db).replace_template(document_type, file.filename, content)
    return DocumentTemplateRead.model_validate(template)
