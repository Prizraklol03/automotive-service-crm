from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.material import CrmMaterial
from app.crm.models.material_attachment import CrmMaterialAttachment
from app.crm.models.service_category import CrmServiceCategory
from app.crm.repositories.query_utils import paginate_scalars


class MaterialRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, material: CrmMaterial) -> CrmMaterial:
        self.session.add(material)
        self.session.flush()
        return material

    def get_by_id(self, material_id: int) -> CrmMaterial | None:
        statement = (
            select(CrmMaterial)
            .options(selectinload(CrmMaterial.service_category))
            .options(selectinload(CrmMaterial.attachments))
            .where(CrmMaterial.id == material_id)
        )
        return self.session.scalar(statement)

    def delete(self, material: CrmMaterial) -> None:
        self.session.delete(material)
        self.session.flush()

    def list_all(self) -> list[CrmMaterial]:
        statement = (
            select(CrmMaterial)
            .options(selectinload(CrmMaterial.service_category))
            .order_by(CrmMaterial.expense_date.desc(), CrmMaterial.created_at.desc(), CrmMaterial.id.desc())
        )
        return list(self.session.scalars(statement))

    def list_in_period(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        category_ids: list[int] | None = None,
    ) -> list[CrmMaterial]:
        statement = select(CrmMaterial).options(selectinload(CrmMaterial.service_category))
        if date_from:
            statement = statement.where(CrmMaterial.expense_date >= date_from)
        if date_to:
            statement = statement.where(CrmMaterial.expense_date <= date_to)
        if category_ids:
            statement = statement.where(CrmMaterial.service_category_id.in_(category_ids))
        statement = statement.order_by(CrmMaterial.expense_date.desc(), CrmMaterial.created_at.desc(), CrmMaterial.id.desc())
        return list(self.session.scalars(statement))

    def get_attachment_counts(self, material_ids: list[int]) -> dict[int, int]:
        if not material_ids:
            return {}

        rows = self.session.execute(
            select(
                CrmMaterialAttachment.material_id,
                func.count(CrmMaterialAttachment.id),
            )
            .where(CrmMaterialAttachment.material_id.in_(material_ids))
            .group_by(CrmMaterialAttachment.material_id)
        ).all()
        return {material_id: int(count) for material_id, count in rows}

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
        statement = select(CrmMaterial).options(selectinload(CrmMaterial.service_category))
        if date_from:
            statement = statement.where(CrmMaterial.expense_date >= date_from)
        if date_to:
            statement = statement.where(CrmMaterial.expense_date <= date_to)

        sort_key = (sort_by or "expense_date").strip()
        sort_direction = (sort_dir or "desc").strip().lower()
        if sort_key == "material_name":
            sort_column = CrmMaterial.material_name
        elif sort_key == "row_total":
            sort_column = CrmMaterial.row_total
        elif sort_key == "quantity":
            sort_column = CrmMaterial.quantity
        elif sort_key == "unit_price":
            sort_column = CrmMaterial.unit_price
        elif sort_key == "id":
            sort_column = CrmMaterial.id
        else:
            sort_column = CrmMaterial.expense_date

        order_by = sort_column.desc() if sort_direction == "desc" else sort_column.asc()
        statement = statement.order_by(order_by, CrmMaterial.created_at.desc(), CrmMaterial.id.desc())
        return paginate_scalars(self.session, statement, page=page, page_size=page_size)

    def get_list_summary(self, *, date_from: date | None = None, date_to: date | None = None) -> dict[str, object]:
        total_statement = select(func.coalesce(func.sum(CrmMaterial.row_total), 0))
        grouped_statement = (
            select(
                CrmMaterial.service_category_id.label("category_id"),
                CrmServiceCategory.name.label("name"),
                func.coalesce(func.sum(CrmMaterial.row_total), 0).label("amount"),
                func.count().label("rows"),
            )
            .select_from(CrmMaterial)
            .outerjoin(CrmMaterial.service_category)
            .group_by(CrmMaterial.service_category_id, CrmServiceCategory.name)
        )
        if date_from:
            total_statement = total_statement.where(CrmMaterial.expense_date >= date_from)
            grouped_statement = grouped_statement.where(CrmMaterial.expense_date >= date_from)
        if date_to:
            total_statement = total_statement.where(CrmMaterial.expense_date <= date_to)
            grouped_statement = grouped_statement.where(CrmMaterial.expense_date <= date_to)

        categories = [
            {
                "category_id": category_id,
                "name": name or "Без категории",
                "amount": amount,
                "rows": rows,
            }
            for category_id, name, amount, rows in self.session.execute(grouped_statement).all()
        ]
        categories.sort(key=lambda item: (-item["amount"], item["name"]))
        total_amount = self.session.scalar(total_statement) or 0
        return {"total_amount": total_amount, "categories": categories}
