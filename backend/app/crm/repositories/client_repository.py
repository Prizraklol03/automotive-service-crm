from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.privacy import hash_name_lookup_tokens, hash_phone_lookup
from app.crm.models.client import CrmClient
from app.crm.repositories.query_utils import paginate_scalars
from app.crm.utils.normalization import normalize_phone_search_query, normalize_telegram_username


class ClientRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, client: CrmClient) -> CrmClient:
        self.session.add(client)
        self.session.flush()
        return client

    @staticmethod
    def _active_predicate():
        return CrmClient.is_deleted.is_(False)

    def get_by_id(self, client_id: int, *, include_deleted: bool = False) -> CrmClient | None:
        statement = select(CrmClient).where(CrmClient.id == client_id)
        if not include_deleted:
            statement = statement.where(self._active_predicate())
        return self.session.scalar(statement)

    def get_by_normalized_phone(self, phone_normalized: str, *, include_deleted: bool = False) -> CrmClient | None:
        statement = select(CrmClient).where(
            or_(
                CrmClient.phone_search_hash == hash_phone_lookup(phone_normalized),
                CrmClient.phone_normalized == phone_normalized,
            )
        )
        if not include_deleted:
            statement = statement.where(self._active_predicate())
        return self.session.scalar(statement)

    def list_all(self) -> list[CrmClient]:
        statement = (
            select(CrmClient)
            .where(self._active_predicate())
            .order_by(CrmClient.id.asc())
        )
        return list(self.session.scalars(statement))

    def search(self, *, name_query: str | None, phone_query: str | None, telegram_query: str | None) -> list[CrmClient]:
        statement = select(CrmClient).where(self._active_predicate())
        predicates = []
        if name_query:
            name_hashes = hash_name_lookup_tokens(name_query)
            if name_hashes:
                predicates.append(CrmClient.name_search_hashes.contains(name_hashes))
        if phone_query:
            predicates.append(CrmClient.phone_search_hash == hash_phone_lookup(phone_query))
            if len(phone_query) >= 4:
                predicates.append(CrmClient.phone_normalized.contains(phone_query))
        if telegram_query:
            predicates.append(CrmClient.telegram_username.ilike(f"%{telegram_query}%"))
        if predicates:
            statement = statement.where(or_(*predicates))
        statement = statement.order_by(CrmClient.id.asc())
        return list(self.session.scalars(statement))

    def list_page(
        self,
        *,
        search_query: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
        sort_by: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[list[CrmClient], int, int, int]:
        statement = select(CrmClient).where(self._active_predicate())
        search_value = (search_query or "").strip()
        predicates = []
        if search_value:
            phone_query = normalize_phone_search_query(search_value) or search_value
            name_hashes = hash_name_lookup_tokens(search_value)
            try:
                telegram_query = normalize_telegram_username(search_value)
            except AppError:
                telegram_query = None
            if name_hashes:
                predicates.append(CrmClient.name_search_hashes.contains(name_hashes))
            predicates.append(CrmClient.phone_search_hash == hash_phone_lookup(phone_query))
            if len(phone_query) >= 4:
                predicates.append(CrmClient.phone_normalized.contains(phone_query))
            if telegram_query:
                predicates.append(CrmClient.telegram_username.ilike(f"%{telegram_query}%"))
        if predicates:
            statement = statement.where(or_(*predicates))

        sort_key = (sort_by or "full_name").strip()
        sort_direction = (sort_dir or "asc").strip().lower()
        if sort_key == "phone_display":
            sort_column = CrmClient.phone_display
        elif sort_key == "id":
            sort_column = CrmClient.id
        else:
            sort_column = CrmClient.id

        order_by = sort_column.desc() if sort_direction == "desc" else sort_column.asc()
        statement = statement.order_by(order_by, CrmClient.id.asc())
        return paginate_scalars(self.session, statement, page=page, page_size=page_size)
