from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.material import CrmMaterial
from app.crm.repositories.material_repository import MaterialRepository
from app.crm.repositories.service_category_repository import ServiceCategoryRepository
from app.crm.schemas.material import MaterialCreate
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.material_attachment_service import MaterialAttachmentService
from app.crm.services.order_calculation_service import OrderCalculationService


class MaterialService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.materials = MaterialRepository(session)
        self.categories = ServiceCategoryRepository(session)
        self.audit_logs = AuditLogService(session)
        self.attachments = MaterialAttachmentService(session)

    def _resolve_category_id(self, service_category_id: int | None) -> int | None:
        if service_category_id is None:
            return None
        category = self.categories.get_by_id(service_category_id)
        if not category:
            raise AppError(code="not_found", message="Категория услуг не найдена", status_code=404)
        return category.id

    def _apply_payload(self, material: CrmMaterial, payload: MaterialCreate) -> None:
        category_id = self._resolve_category_id(payload.service_category_id)
        unit_price = OrderCalculationService.validate_price(Decimal(payload.unit_price), field="unit_price")
        quantity = OrderCalculationService.validate_quantity(int(payload.quantity), field="quantity")

        material.material_name = payload.material_name.strip()
        material.unit_price = unit_price
        material.quantity = quantity
        material.row_total = OrderCalculationService.quantize(unit_price * quantity)
        material.expense_date = payload.expense_date
        material.service_category_id = category_id

    def create(self, payload: MaterialCreate, *, actor_user_id: int | None = None) -> CrmMaterial:
        material = CrmMaterial()
        self._apply_payload(material, payload)
        self.materials.create(material)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="material",
            entity_id=material.id,
            action="create",
            title=f"Создан материал #{material.id}",
            description=f"{material.material_name} · {material.row_total}",
        )
        self.session.commit()
        return self.get(material.id)

    def get(self, material_id: int) -> CrmMaterial:
        material = self.materials.get_by_id(material_id)
        if not material:
            raise AppError(code="not_found", message="Материал не найден", status_code=404)
        return material

    def list_all(self, *, date_from: date | None = None, date_to: date | None = None) -> list[CrmMaterial]:
        if date_from is None and date_to is None:
            return self.materials.list_all()
        return self.materials.list_in_period(date_from=date_from, date_to=date_to)

    def list_page(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmMaterial], int, int, int]:
        return self.materials.list_page(
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )

    def get_list_summary(self, *, date_from: date | None = None, date_to: date | None = None) -> dict[str, object]:
        return self.materials.get_list_summary(date_from=date_from, date_to=date_to)

    def get_attachment_counts(self, material_ids: list[int]) -> dict[int, int]:
        return self.materials.get_attachment_counts(material_ids)

    def update(self, material_id: int, payload: MaterialCreate, *, actor_user_id: int | None = None) -> CrmMaterial:
        material = self.get(material_id)
        self._apply_payload(material, payload)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="material",
            entity_id=material.id,
            action="update",
            title=f"Обновлён материал #{material.id}",
            description=f"{material.material_name} · {material.row_total}",
        )
        self.session.commit()
        return self.get(material.id)

    def delete(self, material_id: int, *, actor_user_id: int | None = None) -> None:
        material = self.get(material_id)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="material",
            entity_id=material.id,
            action="delete",
            title=f"Удалён материал #{material.id}",
            description=material.material_name,
        )
        self.attachments.delete_all_for_material(material.id)
        self.materials.delete(material)
        self.session.commit()
