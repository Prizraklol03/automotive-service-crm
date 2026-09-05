from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.privacy import hash_plate_lookup, hash_vin_lookup
from app.crm.models.car_brand import CrmCarBrand
from app.crm.models.car_model import CrmCarModel
from app.crm.models.vehicle import CrmVehicle
from app.crm.models.vehicle_owner_history import CrmVehicleOwnerHistory
from app.crm.repositories.query_utils import paginate_scalars
from app.crm.utils.normalization import build_plate_search_candidates, build_vin_search_candidates


class VehicleRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def _active_predicate():
        return CrmVehicle.is_deleted.is_(False)

    def current_owner_client_id(self, vehicle: CrmVehicle) -> int:
        current_owner_client_id = self.session.scalar(
            select(CrmVehicleOwnerHistory.client_id)
            .where(
                CrmVehicleOwnerHistory.vehicle_id == vehicle.id,
                CrmVehicleOwnerHistory.owned_to.is_(None),
            )
            .order_by(CrmVehicleOwnerHistory.owned_from.desc(), CrmVehicleOwnerHistory.id.desc())
            .limit(1)
        )
        return current_owner_client_id if current_owner_client_id is not None else vehicle.client_id

    def create(self, vehicle: CrmVehicle) -> CrmVehicle:
        self.session.add(vehicle)
        self.session.flush()
        return vehicle

    def get_by_id(self, vehicle_id: int, *, include_deleted: bool = False) -> CrmVehicle | None:
        statement = (
            select(CrmVehicle)
            .options(
                selectinload(CrmVehicle.client),
                selectinload(CrmVehicle.brand_ref),
                selectinload(CrmVehicle.model_ref),
                selectinload(CrmVehicle.owner_history).selectinload(CrmVehicleOwnerHistory.client),
            )
            .where(CrmVehicle.id == vehicle_id)
        )
        if not include_deleted:
            statement = statement.where(self._active_predicate())
        statement = statement.execution_options(populate_existing=True)
        return self.session.scalar(statement)

    def get_by_normalized_plate(self, plate_number_normalized: str, *, include_deleted: bool = False) -> CrmVehicle | None:
        statement = select(CrmVehicle).where(CrmVehicle.plate_search_hash == hash_plate_lookup(plate_number_normalized))
        if not include_deleted:
            statement = statement.where(self._active_predicate())
        return self.session.scalar(statement)

    def list_all(self) -> list[CrmVehicle]:
        statement = (
            select(CrmVehicle)
            .options(
                selectinload(CrmVehicle.client),
                selectinload(CrmVehicle.brand_ref),
                selectinload(CrmVehicle.model_ref),
                selectinload(CrmVehicle.owner_history).selectinload(CrmVehicleOwnerHistory.client),
            )
            .where(self._active_predicate())
            .order_by(CrmVehicle.id.desc())
        )
        return list(self.session.scalars(statement))

    def search(
        self,
        plate_query: str,
        vin_query: str | None = None,
        *,
        search_query: str | None = None,
    ) -> list[CrmVehicle]:
        predicates = []
        if plate_query:
            predicates.extend(
                CrmVehicle.plate_search_hash == hash_plate_lookup(candidate)
                for candidate in build_plate_search_candidates(plate_query)
            )
        if vin_query:
            predicates.extend(
                CrmVehicle.vin_search_hash == hash_vin_lookup(candidate)
                for candidate in build_vin_search_candidates(vin_query)
            )
        if search_query:
            search_value = search_query.strip()
            if search_value:
                normalized_search_value = "".join(character for character in search_value.casefold() if character.isalnum())
                predicates.extend(
                    [
                        CrmVehicle.brand.ilike(f"%{search_value}%"),
                        CrmVehicle.model.ilike(f"%{search_value}%"),
                        CrmVehicle.brand_ref.has(CrmCarBrand.normalized_name == normalized_search_value),
                        CrmVehicle.model_ref.has(CrmCarModel.normalized_name == normalized_search_value),
                        CrmVehicle.brand_ref.has(CrmCarBrand.name.ilike(f"%{search_value}%")),
                        CrmVehicle.model_ref.has(CrmCarModel.name.ilike(f"%{search_value}%")),
                    ]
                )
        if not predicates:
            return self.list_all()

        statement = (
            select(CrmVehicle)
            .options(
                selectinload(CrmVehicle.client),
                selectinload(CrmVehicle.brand_ref),
                selectinload(CrmVehicle.model_ref),
                selectinload(CrmVehicle.owner_history).selectinload(CrmVehicleOwnerHistory.client),
            )
            .where(self._active_predicate(), or_(*predicates))
            .order_by(CrmVehicle.id.desc())
        )
        return list(self.session.scalars(statement))

    def list_page(
        self,
        *,
        search_query: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmVehicle], int, int, int]:
        search_value = (search_query or "").strip()
        predicates = []
        if search_value:
            predicates.extend(
                CrmVehicle.plate_search_hash == hash_plate_lookup(candidate)
                for candidate in build_plate_search_candidates(search_value)
            )
            predicates.extend(
                CrmVehicle.vin_search_hash == hash_vin_lookup(candidate)
                for candidate in build_vin_search_candidates(search_value)
            )
        if search_value:
            normalized_search_value = "".join(character for character in search_value.casefold() if character.isalnum())
            predicates.extend(
                [
                    CrmVehicle.brand.ilike(f"%{search_value}%"),
                    CrmVehicle.model.ilike(f"%{search_value}%"),
                    CrmVehicle.brand_ref.has(CrmCarBrand.normalized_name == normalized_search_value),
                    CrmVehicle.model_ref.has(CrmCarModel.normalized_name == normalized_search_value),
                    CrmVehicle.brand_ref.has(CrmCarBrand.name.ilike(f"%{search_value}%")),
                    CrmVehicle.model_ref.has(CrmCarModel.name.ilike(f"%{search_value}%")),
                ]
            )

        statement = (
            select(CrmVehicle)
            .options(
                selectinload(CrmVehicle.client),
                selectinload(CrmVehicle.brand_ref),
                selectinload(CrmVehicle.model_ref),
            )
            .where(self._active_predicate())
        )
        if predicates:
            statement = statement.where(or_(*predicates))

        sort_key = (sort_by or "id").strip()
        sort_direction = (sort_dir or "desc").strip().lower()
        if sort_key == "plate_number_display":
            sort_column = CrmVehicle.plate_number_display
        elif sort_key == "brand":
            sort_column = CrmVehicle.brand
        elif sort_key == "model":
            sort_column = CrmVehicle.model
        else:
            sort_column = CrmVehicle.id

        order_by = sort_column.desc() if sort_direction == "desc" else sort_column.asc()
        statement = statement.order_by(order_by, CrmVehicle.id.desc())
        return paginate_scalars(self.session, statement, page=page, page_size=page_size)

    def list_by_client(self, client_id: int, *, include_deleted: bool = False) -> list[CrmVehicle]:
        statement = (
            select(CrmVehicle)
            .options(
                selectinload(CrmVehicle.client),
                selectinload(CrmVehicle.brand_ref),
                selectinload(CrmVehicle.model_ref),
                selectinload(CrmVehicle.owner_history).selectinload(CrmVehicleOwnerHistory.client),
            )
            .where(
                CrmVehicle.owner_history.any(
                    and_(
                        CrmVehicleOwnerHistory.client_id == client_id,
                        CrmVehicleOwnerHistory.owned_to.is_(None),
                    )
                )
            )
            .order_by(CrmVehicle.id.desc())
        )
        if not include_deleted:
            statement = statement.where(self._active_predicate())
        return list(self.session.scalars(statement))
