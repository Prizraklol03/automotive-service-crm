from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_permission
from app.crm.schemas.client import ClientCreate, ClientRead
from app.crm.schemas.summary import ClientDetailRead, ClientSummaryRead, OrderHistoryRead, ServiceHistoryRead
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.client_service import ClientService
from app.crm.services.personal_data_service import PersonalDataMaskingService
from app.crm.services.summary_service import SummaryService

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
        entity_type="client",
        entity_id=entity_id,
        action=action,
        title="Client personal data accessed",
        metadata_json={"search_present": search_present, "paged": paged},
    )
    db.commit()


@router.post("", response_model=ClientDetailRead, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.create")),
) -> ClientDetailRead:
    client = ClientService(db).create(payload, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_client_detail(client.id)
    return ClientDetailRead.model_validate(
        PersonalDataMaskingService.project_client_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("", response_model=Any)
def list_clients(
    q: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.view")),
) -> Any:
    service = ClientService(db)
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
            PersonalDataMaskingService.project_client(ClientRead.model_validate(item).model_dump(), can_view_personal=can_view_personal)
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
            "items": [ClientRead.model_validate(item) for item in serialized_items],
            "total": total,
            "page": normalized_page,
            "page_size": normalized_page_size,
        }
    source_items = service.search(q) if (q or "").strip() else service.list_all()
    serialized_items = [
        PersonalDataMaskingService.project_client(ClientRead.model_validate(item).model_dump(), can_view_personal=can_view_personal)
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
    return [ClientRead.model_validate(item) for item in serialized_items]


@router.get("/search", response_model=list[ClientRead])
def search_clients(
    q: str,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.view")),
) -> list[ClientRead]:
    can_view_personal = _can_view_personal_data(current_user)
    items = [
        PersonalDataMaskingService.project_client(ClientRead.model_validate(item).model_dump(), can_view_personal=can_view_personal)
        for item in ClientService(db).search(q)
    ]
    return [ClientRead.model_validate(item) for item in items]


@router.get("/{client_id}/summary", response_model=ClientSummaryRead)
def get_client_summary(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.view")),
) -> ClientSummaryRead:
    summary = SummaryService(db).get_client_summary(client_id)
    return ClientSummaryRead.model_validate(
        PersonalDataMaskingService.project_client_summary(summary.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{client_id}/orders", response_model=OrderHistoryRead)
def get_client_orders(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.view")),
) -> OrderHistoryRead:
    history = SummaryService(db).list_client_orders(client_id)
    return OrderHistoryRead.model_validate(
        PersonalDataMaskingService.project_order_history(history.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{client_id}/services-history", response_model=ServiceHistoryRead)
def get_client_services_history(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.view")),
) -> ServiceHistoryRead:
    history = SummaryService(db).list_client_services_history(client_id)
    return ServiceHistoryRead.model_validate(
        PersonalDataMaskingService.project_service_history(history.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("/{client_id}", response_model=ClientDetailRead)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.view")),
) -> ClientDetailRead:
    detail = SummaryService(db).get_client_detail(client_id)
    can_view_personal = _can_view_personal_data(current_user)
    if can_view_personal:
        _audit_personal_data_read(db, actor_user_id=current_user.user.id, action="view", entity_id=client_id)
    return ClientDetailRead.model_validate(
        PersonalDataMaskingService.project_client_detail(detail.model_dump(), can_view_personal=can_view_personal)
    )


@router.put("/{client_id}", response_model=ClientDetailRead)
def update_client(
    client_id: int,
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.edit")),
) -> ClientDetailRead:
    client = ClientService(db).update(client_id, payload, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_client_detail(client.id)
    return ClientDetailRead.model_validate(
        PersonalDataMaskingService.project_client_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.patch("/{client_id}/archive", response_model=ClientDetailRead)
def archive_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("clients.edit")),
) -> ClientDetailRead:
    client = ClientService(db).archive(client_id, actor_user_id=current_user.user.id)
    detail = SummaryService(db).get_client_detail(client.id)
    return ClientDetailRead.model_validate(
        PersonalDataMaskingService.project_client_detail(detail.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )
