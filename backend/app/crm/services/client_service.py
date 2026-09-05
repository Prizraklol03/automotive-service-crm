from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.privacy import hash_name_lookup_tokens, hash_phone_lookup, hash_phone_search_fragments
from app.core.time import app_now_naive
from app.crm.models.client import CrmClient
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.vehicle_repository import VehicleRepository
from app.crm.schemas.client import ClientCreate
from app.crm.services.audit_log_service import AuditLogService
from app.crm.utils.normalization import normalize_phone, normalize_phone_search_query, normalize_telegram_username


class ClientService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = ClientRepository(session)
        self.vehicles = VehicleRepository(session)
        self.audit_logs = AuditLogService(session)

    @staticmethod
    def _strip_or_none(value: str | None) -> str | None:
        text = value.strip() if value else ""
        return text or None

    def _apply_payload(self, client: CrmClient, payload: ClientCreate, *, preserve_missing: bool = False) -> None:
        normalized_phone = normalize_phone(payload.phone)
        fields_set = getattr(payload, "model_fields_set", set())
        client_type = payload.client_type if not preserve_missing or "client_type" in fields_set else client.client_type
        full_name = client.full_name if preserve_missing and "full_name" not in fields_set else self._strip_or_none(payload.full_name)
        company_name = (
            client.company_name if preserve_missing and "company_name" not in fields_set else self._strip_or_none(payload.company_name)
        )
        address = client.address if preserve_missing and "address" not in fields_set else self._strip_or_none(payload.address)
        inn = client.inn if preserve_missing and "inn" not in fields_set else self._strip_or_none(payload.inn)
        kpp = client.kpp if preserve_missing and "kpp" not in fields_set else self._strip_or_none(payload.kpp)
        ogrn = client.ogrn if preserve_missing and "ogrn" not in fields_set else self._strip_or_none(payload.ogrn)
        legal_address = (
            client.legal_address if preserve_missing and "legal_address" not in fields_set else self._strip_or_none(payload.legal_address)
        )
        actual_address = (
            client.actual_address if preserve_missing and "actual_address" not in fields_set else self._strip_or_none(payload.actual_address)
        )
        representative_full_name = (
            client.representative_full_name
            if preserve_missing and "representative_full_name" not in fields_set
            else self._strip_or_none(payload.representative_full_name)
        )
        representative_position = (
            client.representative_position
            if preserve_missing and "representative_position" not in fields_set
            else self._strip_or_none(payload.representative_position)
        )
        representative_basis = (
            client.representative_basis
            if preserve_missing and "representative_basis" not in fields_set
            else self._strip_or_none(payload.representative_basis)
        )
        telegram_username = (
            client.telegram_username
            if preserve_missing and "telegram_username" not in fields_set
            else normalize_telegram_username(payload.telegram_username)
        )
        comment = client.comment if preserve_missing and "comment" not in fields_set else self._strip_or_none(payload.comment)

        display_label = self._strip_or_none(company_name if client_type == "legal" else full_name)
        if display_label is None:
            display_label = self._strip_or_none(full_name if client_type == "legal" else company_name)
        if display_label is None:
            display_label = normalized_phone

        if not preserve_missing or "client_type" in fields_set:
            client.client_type = client_type
        if not preserve_missing or "full_name" in fields_set or client_type == "legal":
            client.full_name = display_label
        client.phone_display = normalized_phone
        client.phone_normalized = normalized_phone
        client.phone_search_hash = hash_phone_lookup(normalized_phone)
        client.phone_fragment_hashes = hash_phone_search_fragments(normalized_phone)
        client.name_search_hashes = hash_name_lookup_tokens(full_name, company_name, display_label)
        client.address = address
        client.company_name = company_name if client_type == "legal" else (client.company_name if preserve_missing and "company_name" not in fields_set else None)
        client.inn = inn if client_type == "legal" else (client.inn if preserve_missing and "inn" not in fields_set else None)
        client.kpp = kpp if client_type == "legal" else (client.kpp if preserve_missing and "kpp" not in fields_set else None)
        client.ogrn = ogrn if client_type == "legal" else (client.ogrn if preserve_missing and "ogrn" not in fields_set else None)
        client.legal_address = legal_address if client_type == "legal" else (client.legal_address if preserve_missing and "legal_address" not in fields_set else None)
        client.actual_address = actual_address if client_type == "legal" else (client.actual_address if preserve_missing and "actual_address" not in fields_set else None)
        client.representative_full_name = (
            representative_full_name
            if client_type == "legal"
            else (client.representative_full_name if preserve_missing and "representative_full_name" not in fields_set else None)
        )
        client.representative_position = (
            representative_position
            if client_type == "legal"
            else (client.representative_position if preserve_missing and "representative_position" not in fields_set else None)
        )
        client.representative_basis = (
            representative_basis
            if client_type == "legal"
            else (client.representative_basis if preserve_missing and "representative_basis" not in fields_set else None)
        )
        client.telegram_username = telegram_username
        client.comment = comment

    def create(self, payload: ClientCreate, *, actor_user_id: int | None = None) -> CrmClient:
        client = CrmClient(
            full_name="",
            client_type=payload.client_type,
            phone_display="",
            phone_normalized="",
        )
        self._apply_payload(client, payload)
        try:
            self.repository.create(client)
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="client",
                entity_id=client.id,
                action="create",
                title=f"Создан клиент {client.full_name}",
                description=client.phone_display,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Клиент с таким телефоном уже существует", status_code=409) from exc
        return self.get(client.id)

    def list_all(self) -> list[CrmClient]:
        return self.repository.list_all()

    def list_page(
        self,
        *,
        search: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmClient], int, int, int]:
        return self.repository.list_page(
            search_query=(search or "").strip() or None,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )

    def search(self, query: str) -> list[CrmClient]:
        search_query = query.strip()
        if not search_query:
            return self.list_all()
        phone_query = normalize_phone_search_query(search_query)
        try:
            telegram_query = normalize_telegram_username(search_query)
        except AppError:
            telegram_query = None
        return self.repository.search(
            name_query=None if telegram_query else search_query,
            phone_query=phone_query or None,
            telegram_query=telegram_query or None,
        )

    def get(self, client_id: int, *, include_deleted: bool = True) -> CrmClient:
        client = self.repository.get_by_id(client_id, include_deleted=include_deleted)
        if not client:
            raise AppError(code="not_found", message="Клиент не найден", status_code=404)
        return client

    def update(self, client_id: int, payload: ClientCreate, *, actor_user_id: int | None = None) -> CrmClient:
        client = self.get(client_id)
        self._apply_payload(client, payload, preserve_missing=True)
        try:
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="client",
                entity_id=client.id,
                action="update",
                title=f"Обновлён клиент {client.full_name}",
                description=client.phone_display,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Клиент с таким телефоном уже существует", status_code=409) from exc
        return self.get(client_id)

    def archive(self, client_id: int, *, actor_user_id: int | None) -> CrmClient:
        client = self.get(client_id)
        if client.is_deleted:
            return client

        deleted_at = app_now_naive()
        client.is_deleted = True
        client.deleted_at = deleted_at

        for vehicle in self.vehicles.list_by_client(client_id):
            vehicle.is_deleted = True
            vehicle.deleted_at = deleted_at
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="vehicle",
                entity_id=vehicle.id,
                action="archive",
                title=f"Архивирован автомобиль {vehicle.plate_number_display}",
                description="Архивирован вместе с клиентом",
            )

        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="client",
            entity_id=client.id,
            action="archive",
            title=f"Архивирован клиент {client.full_name}",
            description=client.phone_display,
        )
        self.session.commit()
        return self.get(client_id)
