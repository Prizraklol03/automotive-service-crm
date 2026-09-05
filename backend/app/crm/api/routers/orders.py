from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, get_current_user, require_permission
from app.crm.schemas.order import OrderCreate, OrderListSummaryRead, OrderRead, OrderStatusUpdate, OrderSummaryRead
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.order_service import CrmOrderAppService
from app.crm.services.personal_data_service import PersonalDataMaskingService

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
        entity_type="order",
        entity_id=entity_id,
        action=action,
        title="Order personal data accessed",
        metadata_json={"search_present": search_present, "paged": paged},
    )
    db.commit()


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.create")),
) -> OrderRead:
    service = CrmOrderAppService(db)
    order = service.to_read(
        service.create(payload, actor_user_id=current_user.user.id, actor_permissions=current_user.permissions)
    )
    return OrderRead.model_validate(
        PersonalDataMaskingService.project_order_detail(order.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.get("", response_model=Any)
def list_orders(
    archived_scope: str | None = None,
    search: str | None = None,
    status: str | None = None,
    scheduled_from: date | None = None,
    scheduled_to: date | None = None,
    updated_from: date | None = None,
    updated_to: date | None = None,
    payment_status: str | None = None,
    has_comment: bool | None = None,
    has_documents: bool | None = None,
    client: str | None = None,
    brand: str | None = None,
    model: str | None = None,
    plate: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.view")),
) -> Any:
    service = CrmOrderAppService(db)
    can_view_personal = _can_view_personal_data(current_user)
    if page is not None or page_size is not None:
        status_codes = [value.strip() for value in status.split(",") if value.strip()] if status else None
        payment_statuses = [value.strip() for value in payment_status.split(",") if value.strip()] if payment_status else None
        sort_keys = [value.strip() for value in sort_by.split(",") if value.strip()] if sort_by else None
        sort_directions = [value.strip() for value in sort_dir.split(",") if value.strip()] if sort_dir else None
        items, total, normalized_page, normalized_page_size = service.list_page(
            archived_scope=archived_scope,
            search=search,
            status_codes=status_codes,
            scheduled_from=scheduled_from,
            scheduled_to=scheduled_to,
            updated_from=updated_from,
            updated_to=updated_to,
            payment_statuses=payment_statuses,
            has_comment=has_comment,
            has_documents=has_documents,
            client_filter=client,
            brand=brand,
            model=model,
            plate=plate,
            sort_by=sort_keys,
            sort_dir=sort_directions,
            page=page,
            page_size=page_size,
        )
        serialized_items = [
            PersonalDataMaskingService.project_order_summary(service.to_summary_read(order).model_dump(), can_view_personal=can_view_personal)
            for order in items
        ]
        if can_view_personal:
            _audit_personal_data_read(
                db,
                actor_user_id=current_user.user.id,
                action="list_view",
                entity_id=None,
                search_present=bool((search or "").strip()),
                paged=True,
            )
        return {
            "items": [OrderSummaryRead.model_validate(item) for item in serialized_items],
            "total": total,
            "page": normalized_page,
            "page_size": normalized_page_size,
        }

    source_items = service.search(search, archived=archived_scope == "archived" if archived_scope in {"active", "archived"} else None) if (search or "").strip() else service.list_all(archived=None)
    items = [
        OrderRead.model_validate(
            PersonalDataMaskingService.project_order_detail(service.to_read(order).model_dump(), can_view_personal=can_view_personal)
        )
        for order in source_items
    ]
    if can_view_personal:
        _audit_personal_data_read(
            db,
            actor_user_id=current_user.user.id,
            action="list_view",
            entity_id=None,
            search_present=bool((search or "").strip()),
            paged=False,
        )
    return items


@router.get("/summary", response_model=OrderListSummaryRead)
def list_orders_summary(
    archived_scope: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.view")),
) -> OrderListSummaryRead:
    service = CrmOrderAppService(db)
    return service.get_list_summary(archived_scope=archived_scope, search=search)


@router.get("/search", response_model=list[OrderSummaryRead])
def search_orders(
    q: str,
    archived: bool | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.view")),
) -> list[OrderSummaryRead]:
    service = CrmOrderAppService(db)
    can_view_personal = _can_view_personal_data(current_user)
    items = [
        PersonalDataMaskingService.project_order_summary(service.to_summary_read(order).model_dump(), can_view_personal=can_view_personal)
        for order in service.search(q, archived=archived)
    ]
    return [OrderSummaryRead.model_validate(item) for item in items]


@router.get("/archive", response_model=list[OrderRead])
def list_archive(
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.view")),
) -> list[OrderRead]:
    service = CrmOrderAppService(db)
    can_view_personal = _can_view_personal_data(current_user)
    return [
        OrderRead.model_validate(
            PersonalDataMaskingService.project_order_detail(service.to_read(order).model_dump(), can_view_personal=can_view_personal)
        )
        for order in service.list_archive()
    ]


@router.get("/{order_id}", response_model=OrderRead)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.view")),
) -> OrderRead:
    service = CrmOrderAppService(db)
    order = service.to_read(service.get(order_id))
    can_view_personal = _can_view_personal_data(current_user)
    if can_view_personal:
        _audit_personal_data_read(db, actor_user_id=current_user.user.id, action="view", entity_id=order_id)
    return OrderRead.model_validate(
        PersonalDataMaskingService.project_order_detail(order.model_dump(), can_view_personal=can_view_personal)
    )


@router.put("/{order_id}", response_model=OrderRead)
def update_order(
    order_id: int,
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.edit")),
) -> OrderRead:
    service = CrmOrderAppService(db)
    order = service.to_read(
        service.update(order_id, payload, actor_user_id=current_user.user.id, actor_permissions=current_user.permissions)
    )
    return OrderRead.model_validate(
        PersonalDataMaskingService.project_order_detail(order.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )


@router.patch("/{order_id}/status", response_model=OrderRead)
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.edit")),
) -> OrderRead:
    service = CrmOrderAppService(db)
    order = service.to_read(
        service.update_status(
            order_id,
            payload.status,
            completed_at=payload.completed_at,
            actor_user_id=current_user.user.id,
            actor_permissions=current_user.permissions,
        )
    )
    return OrderRead.model_validate(
        PersonalDataMaskingService.project_order_detail(order.model_dump(), can_view_personal=_can_view_personal_data(current_user))
    )
