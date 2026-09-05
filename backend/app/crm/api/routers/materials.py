from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.material import MaterialCreate, MaterialListSummaryRead, MaterialRead
from app.crm.services.material_service import MaterialService

router = APIRouter()


def _to_read_model(material, *, attachments_count: int | None = None) -> MaterialRead:
    return MaterialRead(
        id=material.id,
        material_name=material.material_name,
        unit_price=material.unit_price,
        quantity=material.quantity,
        row_total=material.row_total,
        service_category_id=material.service_category_id,
        service_category_name=material.service_category.name if material.service_category else None,
        expense_date=material.expense_date,
        attachments_count=attachments_count if attachments_count is not None else len(material.attachments or []),
    )


@router.get("", response_model=Any)
def list_materials(
    date_from: date | None = None,
    date_to: date | None = None,
    page: int | None = None,
    page_size: int | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("materials.view")),
) -> Any:
    service = MaterialService(db)
    if page is not None or page_size is not None:
        items, total, normalized_page, normalized_page_size = service.list_page(
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        attachment_counts = service.get_attachment_counts([item.id for item in items])
        return {
            "items": [_to_read_model(item, attachments_count=attachment_counts.get(item.id, 0)) for item in items],
            "total": total,
            "page": normalized_page,
            "page_size": normalized_page_size,
        }
    items = service.list_all(date_from=date_from, date_to=date_to)
    attachment_counts = service.get_attachment_counts([item.id for item in items])
    return [_to_read_model(item, attachments_count=attachment_counts.get(item.id, 0)) for item in items]


@router.get("/summary", response_model=MaterialListSummaryRead)
def get_materials_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("materials.view")),
) -> MaterialListSummaryRead:
    return MaterialListSummaryRead.model_validate(MaterialService(db).get_list_summary(date_from=date_from, date_to=date_to))


@router.get("/{material_id}", response_model=MaterialRead)
def get_material(
    material_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("materials.view")),
) -> MaterialRead:
    return _to_read_model(MaterialService(db).get(material_id))


@router.post("", response_model=MaterialRead, status_code=status.HTTP_201_CREATED)
def create_material(
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> MaterialRead:
    return _to_read_model(MaterialService(db).create(payload, actor_user_id=current_user.user.id))


@router.patch("/{material_id}", response_model=MaterialRead)
def update_material(
    material_id: int,
    payload: MaterialCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> MaterialRead:
    return _to_read_model(MaterialService(db).update(material_id, payload, actor_user_id=current_user.user.id))


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("materials.manage")),
) -> Response:
    MaterialService(db).delete(material_id, actor_user_id=current_user.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
