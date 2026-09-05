from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.car_model import CrmCarModel


class CarModelRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, model: CrmCarModel) -> CrmCarModel:
        self.session.add(model)
        self.session.flush()
        return model

    def get_by_id(self, model_id: int) -> CrmCarModel | None:
        statement = select(CrmCarModel).options(selectinload(CrmCarModel.brand)).where(CrmCarModel.id == model_id)
        return self.session.scalar(statement)

    def get_by_brand_and_name(self, brand_id: int, name: str) -> CrmCarModel | None:
        return self.session.scalar(select(CrmCarModel).where(CrmCarModel.brand_id == brand_id, CrmCarModel.name == name))

    def get_by_brand_and_normalized_name(self, brand_id: int, normalized_name: str) -> CrmCarModel | None:
        return self.session.scalar(
            select(CrmCarModel).where(
                CrmCarModel.brand_id == brand_id,
                CrmCarModel.normalized_name == normalized_name,
            )
        )

    def get_by_source_identifier(self, source_name: str, source_model_id: str) -> CrmCarModel | None:
        statement = (
            select(CrmCarModel)
            .options(selectinload(CrmCarModel.brand))
            .where(CrmCarModel.source_name == source_name, CrmCarModel.source_model_id == source_model_id)
        )
        return self.session.scalar(statement)

    def list_all(self) -> list[CrmCarModel]:
        statement = (
            select(CrmCarModel)
            .options(selectinload(CrmCarModel.brand))
            .order_by(CrmCarModel.sort_order.asc(), CrmCarModel.name.asc(), CrmCarModel.id.asc())
        )
        return list(self.session.scalars(statement))

    def list_by_brand(self, brand_id: int) -> list[CrmCarModel]:
        statement = (
            select(CrmCarModel)
            .options(selectinload(CrmCarModel.brand))
            .where(CrmCarModel.brand_id == brand_id)
            .order_by(CrmCarModel.sort_order.asc(), CrmCarModel.name.asc(), CrmCarModel.id.asc())
        )
        return list(self.session.scalars(statement))

    def count_all(self) -> int:
        return int(self.session.scalar(select(func.count()).select_from(CrmCarModel)) or 0)
