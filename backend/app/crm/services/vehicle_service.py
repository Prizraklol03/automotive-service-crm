from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.privacy import hash_plate_lookup, hash_plate_search_fragments, hash_vin_lookup
from app.core.time import app_now_naive
from app.crm.models.vehicle import CrmVehicle
from app.crm.models.vehicle_owner_history import CrmVehicleOwnerHistory
from app.crm.repositories.car_brand_repository import CarBrandRepository
from app.crm.repositories.car_model_repository import CarModelRepository
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.vehicle_repository import VehicleRepository
from app.crm.schemas.vehicle import VehicleCreate, VehicleOwnerChangeCreate
from app.crm.services.audit_log_service import AuditLogService
from app.crm.utils.normalization import (
    normalize_plate_number,
    normalize_plate_search_query,
    normalize_upper_text,
    normalize_vin_search_query,
)


class VehicleService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.brands = CarBrandRepository(session)
        self.models = CarModelRepository(session)
        self.clients = ClientRepository(session)
        self.repository = VehicleRepository(session)
        self.audit_logs = AuditLogService(session)

    def _resolve_brand_model(self, payload: VehicleCreate):
        brand = self.brands.get_by_id(payload.brand_id) if payload.brand_id is not None else None
        if payload.brand_id is not None and not brand:
            raise AppError(code="not_found", message="Марка автомобиля не найдена", status_code=404)

        model = self.models.get_by_id(payload.model_id) if payload.model_id is not None else None
        if payload.model_id is not None and not model:
            raise AppError(code="not_found", message="Модель автомобиля не найдена", status_code=404)
        if model and brand and model.brand_id != brand.id:
            raise AppError(code="conflict", message="Модель автомобиля не относится к выбранной марке", status_code=409)
        if model and not brand:
            brand = model.brand
        return brand, model

    def _current_owner_row(self, vehicle_id: int) -> CrmVehicleOwnerHistory | None:
        return self.session.scalar(
            select(CrmVehicleOwnerHistory).where(
                CrmVehicleOwnerHistory.vehicle_id == vehicle_id,
                CrmVehicleOwnerHistory.owned_to.is_(None),
            )
        )

    def _normalize_owned_from(self, owned_from: datetime | date | None) -> date:
        if owned_from is None:
            return app_now_naive().date()
        if isinstance(owned_from, datetime):
            return owned_from.date()
        return owned_from

    def _set_owner(
        self,
        vehicle: CrmVehicle,
        *,
        client_id: int,
        owned_from: datetime | date | None = None,
        comment: str | None = None,
    ) -> None:
        effective_owned_from = self._normalize_owned_from(owned_from)
        current_owner = self._current_owner_row(vehicle.id)

        if current_owner and current_owner.client_id == client_id:
            current_owner.comment = comment.strip() if comment else current_owner.comment
            vehicle.client_id = client_id
            return

        if current_owner:
            if effective_owned_from < current_owner.owned_from:
                raise AppError(
                    code="validation_error",
                    message="Дата смены владельца не может быть раньше текущего периода владения",
                    status_code=422,
                )
            current_owner.owned_to = effective_owned_from

        self.session.add(
            CrmVehicleOwnerHistory(
                vehicle_id=vehicle.id,
                client_id=client_id,
                owned_from=effective_owned_from,
                owned_to=None,
                comment=comment.strip() if comment else None,
            )
        )
        vehicle.client_id = client_id

    def create(self, payload: VehicleCreate, *, actor_user_id: int | None = None) -> CrmVehicle:
        if not self.clients.get_by_id(payload.client_id):
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)

        brand, model = self._resolve_brand_model(payload)
        normalized_plate = normalize_plate_number(payload.plate_number)
        vehicle = CrmVehicle(
            client_id=payload.client_id,
            plate_number_display=payload.plate_number.strip().upper(),
            plate_number_normalized=normalized_plate,
            plate_search_hash=hash_plate_lookup(normalized_plate),
            plate_fragment_hashes=hash_plate_search_fragments(normalized_plate),
            vin=normalize_upper_text(payload.vin),
            vin_search_hash=hash_vin_lookup(normalize_upper_text(payload.vin)),
            brand_id=brand.id if brand else None,
            model_id=model.id if model else None,
            brand=payload.brand.strip() if payload.brand else (brand.name if brand else None),
            model=normalize_upper_text(payload.model) if payload.model else (model.name if model else None),
            year=payload.year,
            mileage=payload.mileage,
            color=normalize_upper_text(payload.color),
            comment=payload.comment.strip() if payload.comment else None,
        )
        try:
            self.repository.create(vehicle)
            self._set_owner(vehicle, client_id=payload.client_id)
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="vehicle",
                entity_id=vehicle.id,
                action="create",
                title=f"Создан автомобиль {vehicle.plate_number_display}",
                description=" ".join(part for part in [vehicle.brand, vehicle.model] if part) or None,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Автомобиль с таким госномером уже существует", status_code=409) from exc
        return self.get(vehicle.id)

    def list_all(self) -> list[CrmVehicle]:
        return self.repository.list_all()

    def list_page(
        self,
        *,
        search: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmVehicle], int, int, int]:
        return self.repository.list_page(
            search_query=(search or "").strip() or None,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )

    def search(self, query: str) -> list[CrmVehicle]:
        search_query = query.strip()
        if not search_query:
            return self.list_all()
        normalized_plate = normalize_plate_search_query(search_query)
        normalized_vin = normalize_vin_search_query(search_query)
        if not normalized_plate and not normalized_vin and not any(character.isalnum() for character in search_query):
            return self.list_all()
        return self.repository.search(normalized_plate, normalized_vin or None, search_query=search_query)

    def get(self, vehicle_id: int, *, include_deleted: bool = True) -> CrmVehicle:
        vehicle = self.repository.get_by_id(vehicle_id, include_deleted=include_deleted)
        if not vehicle:
            raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
        return vehicle

    def update(self, vehicle_id: int, payload: VehicleCreate, *, actor_user_id: int | None = None) -> CrmVehicle:
        vehicle = self.get(vehicle_id)
        client = self.clients.get_by_id(payload.client_id)
        if not client:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)

        original_client_id = vehicle.client_id
        brand, model = self._resolve_brand_model(payload)
        vehicle.plate_number_display = payload.plate_number.strip().upper()
        vehicle.plate_number_normalized = normalize_plate_number(payload.plate_number)
        vehicle.plate_search_hash = hash_plate_lookup(vehicle.plate_number_normalized)
        vehicle.plate_fragment_hashes = hash_plate_search_fragments(vehicle.plate_number_normalized)
        vehicle.vin = normalize_upper_text(payload.vin)
        vehicle.vin_search_hash = hash_vin_lookup(vehicle.vin)
        vehicle.brand_id = brand.id if brand else None
        vehicle.model_id = model.id if model else None
        vehicle.brand = payload.brand.strip() if payload.brand else (brand.name if brand else None)
        vehicle.model = normalize_upper_text(payload.model) if payload.model else (model.name if model else None)
        vehicle.year = payload.year
        vehicle.mileage = payload.mileage
        vehicle.color = normalize_upper_text(payload.color)
        vehicle.comment = payload.comment.strip() if payload.comment else None
        try:
            if payload.client_id != original_client_id:
                self._set_owner(vehicle, client_id=payload.client_id)
                self.audit_logs.record(
                    actor_user_id=actor_user_id,
                    entity_type="vehicle",
                    entity_id=vehicle.id,
                    action="change_owner",
                    title=f"Сменён владелец автомобиля {vehicle.plate_number_display}",
                    description=f"Новый владелец: {client.full_name}",
                )
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="vehicle",
                entity_id=vehicle.id,
                action="update",
                title=f"Обновлён автомобиль {vehicle.plate_number_display}",
                description=" ".join(part for part in [vehicle.brand, vehicle.model] if part) or None,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Автомобиль с таким госномером уже существует", status_code=409) from exc
        return self.get(vehicle_id)

    def get_by_plate_number(self, plate_number: str) -> CrmVehicle:
        normalized_plate = normalize_plate_number(plate_number)
        vehicle = self.repository.get_by_normalized_plate(normalized_plate)
        if not vehicle:
            raise AppError(code="not_found", message="Автомобиль не найден", status_code=404)
        return vehicle

    def change_owner(
        self,
        vehicle_id: int,
        payload: VehicleOwnerChangeCreate,
        *,
        actor_user_id: int | None = None,
    ) -> CrmVehicle:
        vehicle = self.get(vehicle_id)
        client = self.clients.get_by_id(payload.client_id)
        if not client:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        self._set_owner(
            vehicle,
            client_id=payload.client_id,
            owned_from=payload.owned_from,
            comment=payload.comment,
        )
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="vehicle",
            entity_id=vehicle.id,
            action="change_owner",
            title=f"Сменён владелец автомобиля {vehicle.plate_number_display}",
            description=f"Новый владелец: {client.full_name}",
        )
        self.session.commit()
        return self.get(vehicle_id)

    def archive(self, vehicle_id: int, *, actor_user_id: int | None) -> CrmVehicle:
        vehicle = self.get(vehicle_id)
        if vehicle.is_deleted:
            return vehicle

        vehicle.is_deleted = True
        vehicle.deleted_at = app_now_naive()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="vehicle",
            entity_id=vehicle.id,
            action="archive",
            title=f"Архивирован автомобиль {vehicle.plate_number_display}",
            description=" ".join(part for part in [vehicle.brand, vehicle.model] if part) or None,
        )
        self.session.commit()
        return self.get(vehicle_id)
