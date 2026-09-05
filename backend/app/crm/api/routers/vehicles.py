from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_permission
from app.crm.schemas.vehicle import VehicleCreate, VehicleOwnerChangeCreate, VehicleRead
from app.crm.schemas.summary import OrderHistoryRead, ServiceHistoryRead, VehicleDetailRead, VehicleSummaryRead
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.personal_data_service import PersonalDataMaskingService
from app.crm.services.summary_service import SummaryService
from app.crm.services.vehicle_service import VehicleService

router = APIRouter()


def _can_view_personal_data(current_user: CurrentUserContext) -> bool:
    return PersonalDataMaskingService.can_view_personal_data(
        permissions=current_user.permissions,
        role_code=current_user.role_code,
    )


def _audit_personal_data_read(
    db: Session,
    *,
    actor_user_id: int,
    action: str,
    entity_id: int | None,
    search_present: bool = False,
    paged: bool = False,
) -> None:
    AuditLogService(db).record(
        actor_user_id=actor_user_id,
        entity_type="vehicle",
        entity_id=entity_id,
        action=action,
        title="Vehicle personal data accessed",
        metadata_json={"search_present": search_present, "paged": paged},
    )
    db.commit()


@router.post("", response_model=VehicleDetailRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.create")),
) -> VehicleDetailRead:
    vehicle = VehicleService(db).create(payload, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_vehicle_detail(vehicle.id)
    return VehicleDetailRead.model_validate(
        PersonalDataMaskingService.project_vehicle_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("", response_model=Any)
def list_vehicles(
    q: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> Any:
    service = VehicleService(db)
    can_view_personal = _can_view_personal_data(current_user)
    if page is not None or page_size is not None:
        items, total, normalized_page, normalized_page_size = service.list_page(
            search=q,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        serialized_items = [
            PersonalDataMaskingService.project_vehicle(VehicleRead.model_validate(item).model_dump(), can_view_personal=can_view_personal)
            for item in items
        ]
        if can_view_personal:
            _audit_personal_data_read(
                db,
                actor_user_id=current_user.user.id,
                action="list_view",
                entity_id=None,
                search_present=bool((q or "").strip()),
                paged=True,
            )
        return {
            "items": [VehicleRead.model_validate(item) for item in serialized_items],
            "total": total,
            "page": normalized_page,
            "page_size": normalized_page_size,
        }
    source_items = service.search(q) if (q or "").strip() else service.list_all()
    serialized_items = [
        PersonalDataMaskingService.project_vehicle(VehicleRead.model_validate(item).model_dump(), can_view_personal=can_view_personal)
        for item in source_items
    ]
    if can_view_personal:
        _audit_personal_data_read(
            db,
            actor_user_id=current_user.user.id,
            action="list_view",
            entity_id=None,
            search_present=bool((q or "").strip()),
            paged=False,
        )
    return [VehicleRead.model_validate(item) for item in serialized_items]


@router.get("/search", response_model=list[VehicleRead])
def search_vehicles(
    q: str,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> list[VehicleRead]:
    can_view_personal = _can_view_personal_data(current_user)
    items = [
        PersonalDataMaskingService.project_vehicle(VehicleRead.model_validate(item).model_dump(), can_view_personal=can_view_personal)
        for item in VehicleService(db).search(q)
    ]
    return [VehicleRead.model_validate(item) for item in items]


@router.get("/by-plate/{plate_number}", response_model=VehicleRead)
def get_vehicle_by_plate(
    plate_number: str,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> VehicleRead:
    vehicle = VehicleRead.model_validate(VehicleService(db).get_by_plate_number(plate_number))
    return VehicleRead.model_validate(
        PersonalDataMaskingService.project_vehicle(vehicle.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.put("/{vehicle_id}", response_model=VehicleDetailRead)
def update_vehicle(
    vehicle_id: int,
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.edit")),
) -> VehicleDetailRead:
    vehicle = VehicleService(db).update(vehicle_id, payload, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_vehicle_detail(vehicle.id)
    return VehicleDetailRead.model_validate(
        PersonalDataMaskingService.project_vehicle_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.post("/{vehicle_id}/owners", response_model=VehicleDetailRead)
def change_vehicle_owner(
    vehicle_id: int,
    payload: VehicleOwnerChangeCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.edit")),
) -> VehicleDetailRead:
    vehicle = VehicleService(db).change_owner(vehicle_id, payload, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_vehicle_detail(vehicle.id)
    return VehicleDetailRead.model_validate(
        PersonalDataMaskingService.project_vehicle_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{vehicle_id}/summary", response_model=VehicleSummaryRead)
def get_vehicle_summary(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> VehicleSummaryRead:
    summary = SummaryService(db).get_vehicle_summary(vehicle_id)
    return VehicleSummaryRead.model_validate(
        PersonalDataMaskingService.project_vehicle_summary(summary.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{vehicle_id}/orders", response_model=OrderHistoryRead)
def get_vehicle_orders(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> OrderHistoryRead:
    history = SummaryService(db).list_vehicle_orders(vehicle_id)
    return OrderHistoryRead.model_validate(
        PersonalDataMaskingService.project_order_history(history.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{vehicle_id}/services-history", response_model=ServiceHistoryRead)
def get_vehicle_services_history(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> ServiceHistoryRead:
    history = SummaryService(db).list_vehicle_services_history(vehicle_id)
    return ServiceHistoryRead.model_validate(
        PersonalDataMaskingService.project_service_history(history.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{vehicle_id}", response_model=VehicleDetailRead)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.view")),
) -> VehicleDetailRead:
    detail = SummaryService(db).get_vehicle_detail(vehicle_id)
    can_view_personal = _can_view_personal_data(current_user)
    if can_view_personal:
        _audit_personal_data_read(db, actor_user_id=current_user.user.id, action="view", entity_id=vehicle_id)
    return VehicleDetailRead.model_validate(
        PersonalDataMaskingService.project_vehicle_detail(detail.model_dump(), can_view_personal=can_view_personal)
    )


@router.patch("/{vehicle_id}/archive", response_model=VehicleDetailRead)
def archive_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("vehicles.edit")),
) -> VehicleDetailRead:
    vehicle = VehicleService(db).archive(vehicle_id, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_vehicle_detail(vehicle.id)
    return VehicleDetailRead.model_validate(
        PersonalDataMaskingService.project_vehicle_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )
