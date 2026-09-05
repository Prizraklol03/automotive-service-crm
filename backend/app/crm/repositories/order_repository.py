from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from functools import cmp_to_key

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session, aliased, selectinload

from app.core.privacy import (
    hash_name_lookup_tokens,
    hash_phone_fragment_lookup_candidates,
    hash_phone_lookup,
    hash_plate_fragment_lookup_candidates,
    hash_plate_lookup,
    hash_vin_lookup,
)
from app.crm.models.car_brand import CrmCarBrand
from app.crm.models.car_model import CrmCarModel
from app.crm.models.client import CrmClient
from app.crm.models.custom_field import OrderFieldValue
from app.crm.models.order import CrmOrder
from app.crm.models.order_payment import CrmOrderPayment
from app.crm.models.order_service import CrmOrderService
from app.crm.models.order_status import ACTIVE_GROUPS, CrmOrderStatus, StatusGroup
from app.crm.models.service_catalog import CrmServiceCatalog
from app.crm.models.vehicle import CrmVehicle
from app.crm.models.vehicle_owner_history import CrmVehicleOwnerHistory
from app.crm.repositories.query_utils import normalize_page_args, paginate_scalars
from app.crm.utils.normalization import (
    build_plate_search_candidates,
    build_vin_search_candidates,
    normalize_phone_search_query,
)


PLATE_SEARCH_TOKEN = r"(?<!\w)[^\W\d_][\s-]*\d{3}[\s-]*[^\W\d_]{2}(?:[\s-]*\d{2,3})?(?!\w)"
PHONE_SEARCH_TOKEN = r"(?<!\w)\+?\d(?:[\s()\-]*\d){3,}(?!\w)"
SPECIAL_SEARCH_TOKEN_RE = re.compile(f"(?:{PLATE_SEARCH_TOKEN})|(?:{PHONE_SEARCH_TOKEN})", re.UNICODE)
ORDINARY_SEARCH_TOKEN_RE = re.compile(r"\w+(?:-\w+)*", re.UNICODE)


class OrderRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, order: CrmOrder) -> CrmOrder:
        self.session.add(order)
        self.session.flush()
        return order

    @staticmethod
    def _analytics_options():
        return (
            selectinload(CrmOrder.services).selectinload(CrmOrderService.service_catalog).selectinload(
                CrmServiceCatalog.category
            ),
            selectinload(CrmOrder.client),
            selectinload(CrmOrder.payer_client),
            selectinload(CrmOrder.vehicle).selectinload(CrmVehicle.owner_history).selectinload(CrmVehicleOwnerHistory.client),
            selectinload(CrmOrder.status_record),
        )

    @staticmethod
    def _period_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
        start = datetime.combine(date_from, time.min)
        end = datetime.combine(date_to + timedelta(days=1), time.min)
        return start, end

    def get_by_id(self, order_id: int) -> CrmOrder | None:
        statement = (
            select(CrmOrder)
            .options(*self._detail_options())
            .where(CrmOrder.id == order_id)
        )
        return self.session.scalar(statement)

    def list_all(self, *, archived: bool | None = None) -> list[CrmOrder]:
        statement = (
            select(CrmOrder)
            .options(*self._detail_options())
            .order_by(CrmOrder.created_at.desc(), CrmOrder.id.desc())
        )
        if archived is not None:
            statement = statement.where(CrmOrder.is_archived == archived)
        return list(self.session.scalars(statement).unique())

    def list_active_for_analytics(self) -> list[CrmOrder]:
        active_groups = [group.value for group in ACTIVE_GROUPS]
        statement = (
            select(CrmOrder)
            .options(*self._analytics_options())
            .join(CrmOrder.status_record)
            .where(CrmOrderStatus.status_group.in_(active_groups))
            .order_by(CrmOrder.created_at.desc(), CrmOrder.id.desc())
        )
        return list(self.session.scalars(statement).unique())

    def list_period_orders(
        self,
        *,
        date_from: date,
        date_to: date,
        status_codes: list[str] | tuple[str, ...] | None = None,
    ) -> list[CrmOrder]:
        start_dt, end_dt = self._period_bounds(date_from, date_to)
        statement = (
            select(CrmOrder)
            .options(*self._analytics_options())
            .where(
                or_(
                    and_(
                        CrmOrder.completed_at.is_not(None),
                        CrmOrder.completed_at >= start_dt,
                        CrmOrder.completed_at < end_dt,
                    ),
                    and_(
                        CrmOrder.completed_at.is_(None),
                        CrmOrder.created_at >= start_dt,
                        CrmOrder.created_at < end_dt,
                    ),
                )
            )
            .order_by(CrmOrder.created_at.desc(), CrmOrder.completed_at.desc().nullslast(), CrmOrder.id.desc())
        )
        if status_codes:
            statement = statement.where(CrmOrder.status.in_(status_codes))
        return list(self.session.scalars(statement).unique())

    def list_completed_in_period(self, *, date_from: date, date_to: date) -> list[CrmOrder]:
        start_dt, end_dt = self._period_bounds(date_from, date_to)
        statement = (
            select(CrmOrder)
            .options(*self._analytics_options())
            .join(CrmOrder.status_record)
            .where(CrmOrderStatus.status_group == StatusGroup.CLOSED.value)
            .where(CrmOrder.completed_at.is_not(None))
            .where(CrmOrder.completed_at >= start_dt)
            .where(CrmOrder.completed_at < end_dt)
            .order_by(CrmOrder.completed_at.desc(), CrmOrder.id.desc())
        )
        return list(self.session.scalars(statement).unique())

    def get_first_completed_by_client_up_to(self, *, date_to: date) -> dict[int, int]:
        _, end_dt = self._period_bounds(date_to, date_to)
        statement = (
            select(CrmOrder)
            .join(CrmOrder.status_record)
            .where(CrmOrderStatus.status_group == StatusGroup.CLOSED.value)
            .where(CrmOrder.completed_at.is_not(None))
            .where(CrmOrder.completed_at < end_dt)
            .order_by(CrmOrder.client_id.asc(), CrmOrder.completed_at.asc(), CrmOrder.id.asc())
            .distinct(CrmOrder.client_id)
        )
        return {order.client_id: order.id for order in self.session.scalars(statement).unique()}

    def list_page(
        self,
        *,
        archived_scope: str | None = None,
        search: str | None = None,
        status_codes: list[str] | None = None,
        scheduled_from: date | None = None,
        scheduled_to: date | None = None,
        updated_from: date | None = None,
        updated_to: date | None = None,
        payment_statuses: list[str] | None = None,
        has_comment: bool | None = None,
        has_documents: bool | None = None,
        client_filter: str | None = None,
        brand: str | None = None,
        model: str | None = None,
        plate: str | None = None,
        sort_by: list[str] | None = None,
        sort_dir: list[str] | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> tuple[list[CrmOrder], int, int, int]:
        statement = self._build_summary_statement(
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
            client_filter=client_filter,
            brand=brand,
            model=model,
            plate=plate,
        ).options(*self._detail_options())
        if "client_full_name" in (sort_by or []):
            items = list(self.session.scalars(statement).unique())
            items.sort(key=cmp_to_key(lambda left, right: self._compare_orders(left, right, sort_by=sort_by, sort_dir=sort_dir)))
            normalized_page, normalized_page_size, offset = normalize_page_args(page, page_size)
            return items[offset : offset + normalized_page_size], len(items), normalized_page, normalized_page_size
        statement = statement.order_by(*self._build_order_clauses(sort_by=sort_by, sort_dir=sort_dir))
        return paginate_scalars(self.session, statement, page=page, page_size=page_size)

    def search(
        self,
        *,
        name_query: str | None,
        phone_query: str | None,
        plate_query: str | None,
        vin_query: str | None,
        search_query: str | None = None,
        archived: bool | None = None,
    ) -> list[CrmOrder]:
        payer_client = aliased(CrmClient)
        statement = (
            select(CrmOrder)
            .join(CrmOrder.client)
            .outerjoin(payer_client, CrmOrder.payer_client)
            .join(CrmOrder.vehicle)
            .options(*self._detail_options())
            .order_by(CrmOrder.created_at.desc(), CrmOrder.id.desc())
        )
        predicates = self._build_search_predicates(
            payer_client=payer_client,
            search_value=search_query or name_query or phone_query or plate_query or vin_query,
        )
        if predicates:
            statement = statement.where(and_(*predicates))
        if archived is not None:
            statement = statement.where(CrmOrder.is_archived == archived)
        return list(self.session.scalars(statement).unique())

    def get_list_summary(self, *, archived_scope: str | None = None, search: str | None = None) -> dict[str, object]:
        search_statement = self._build_summary_statement(archived_scope=None, search=search)
        scoped_statement = self._build_summary_statement(archived_scope=archived_scope, search=search)
        active_statement = search_statement.where(CrmOrder.is_archived.is_(False))
        archived_statement = search_statement.where(CrmOrder.is_archived.is_(True))
        scope_subquery = scoped_statement.subquery()

        total = int(self.session.scalar(select(func.count()).select_from(search_statement.subquery())) or 0)
        active_total = int(self.session.scalar(select(func.count()).select_from(active_statement.subquery())) or 0)
        archived_total = int(self.session.scalar(select(func.count()).select_from(archived_statement.subquery())) or 0)
        active_in_progress_total = int(
            self.session.scalar(
                select(func.count()).select_from(
                    active_statement.where(
                        CrmOrder.status_record.has(CrmOrderStatus.status_group == "in_progress")
                    ).subquery()
                )
            )
            or 0
        )
        active_waiting_total = int(
            self.session.scalar(
                select(func.count()).select_from(
                    active_statement.where(CrmOrder.status_record.has(CrmOrderStatus.status_group == "new")).subquery()
                )
            )
            or 0
        )
        active_subquery = active_statement.subquery()
        scope_subquery = scoped_statement.subquery()
        active_amount_to_pay = self.session.scalar(
            select(func.coalesce(func.sum(active_subquery.c.amount_to_pay), 0)).select_from(active_subquery)
        )
        status_rows = self.session.execute(
            select(scope_subquery.c.status, func.count()).select_from(scope_subquery).group_by(scope_subquery.c.status)
        ).all()

        return {
            "total": total,
            "active_total": active_total,
            "archived_total": archived_total,
            "active_in_progress_total": active_in_progress_total,
            "active_waiting_total": active_waiting_total,
            "active_amount_to_pay": Decimal(active_amount_to_pay or 0).quantize(Decimal("0.01")),
            "status_counts": {status: int(count) for status, count in status_rows},
        }

    def list_by_client(self, client_id: int) -> list[CrmOrder]:
        statement = (
            select(CrmOrder)
            .options(*self._detail_options())
            .where(CrmOrder.client_id == client_id)
            .order_by(CrmOrder.created_at.desc(), CrmOrder.id.desc())
        )
        return list(self.session.scalars(statement).unique())

    def list_by_vehicle(self, vehicle_id: int) -> list[CrmOrder]:
        statement = (
            select(CrmOrder)
            .options(*self._detail_options())
            .where(CrmOrder.vehicle_id == vehicle_id)
            .order_by(CrmOrder.created_at.desc(), CrmOrder.id.desc())
        )
        return list(self.session.scalars(statement).unique())

    def list_completed(self) -> list[CrmOrder]:
        statement = (
            select(CrmOrder)
            .options(*self._detail_options())
            .where(CrmOrder.completed_at.is_not(None))
            .order_by(CrmOrder.completed_at.desc(), CrmOrder.id.desc())
        )
        return list(self.session.scalars(statement).unique())

    @staticmethod
    def _detail_options():
        return (
            selectinload(CrmOrder.services)
            .selectinload(CrmOrderService.service_catalog)
            .selectinload(CrmServiceCatalog.category),
            selectinload(CrmOrder.payments).selectinload(CrmOrderPayment.created_by_user),
            selectinload(CrmOrder.client),
            selectinload(CrmOrder.payer_client),
            selectinload(CrmOrder.vehicle).selectinload(CrmVehicle.owner_history).selectinload(CrmVehicleOwnerHistory.client),
            selectinload(CrmOrder.field_values).selectinload(OrderFieldValue.field_def),
            selectinload(CrmOrder.status_record),
        )

    def _build_summary_statement(
        self,
        *,
        archived_scope: str | None,
        search: str | None,
        status_codes: list[str] | None = None,
        scheduled_from: date | None = None,
        scheduled_to: date | None = None,
        updated_from: date | None = None,
        updated_to: date | None = None,
        payment_statuses: list[str] | None = None,
        has_comment: bool | None = None,
        has_documents: bool | None = None,
        client_filter: str | None = None,
        brand: str | None = None,
        model: str | None = None,
        plate: str | None = None,
    ):
        payer_client = aliased(CrmClient)
        statement = (
            select(CrmOrder)
            .join(CrmOrder.client)
            .outerjoin(payer_client, CrmOrder.payer_client)
            .join(CrmOrder.vehicle)
            .join(CrmOrder.status_record)
        )
        search_value = (search or "").strip()
        predicates = self._build_search_predicates(
            payer_client=payer_client,
            search_value=search_value or None,
        )
        if predicates:
            statement = statement.where(and_(*predicates))
        if archived_scope == "active":
            statement = statement.where(CrmOrder.is_archived.is_(False))
        elif archived_scope == "archived":
            statement = statement.where(CrmOrder.is_archived.is_(True))
        if status_codes:
            statement = statement.where(CrmOrder.status.in_(status_codes))
        if scheduled_from:
            start_dt, _ = self._period_bounds(scheduled_from, scheduled_from)
            statement = statement.where(CrmOrder.scheduled_for >= start_dt)
        if scheduled_to:
            _, end_dt = self._period_bounds(scheduled_to, scheduled_to)
            statement = statement.where(CrmOrder.scheduled_for < end_dt)
        if updated_from:
            start_dt, _ = self._period_bounds(updated_from, updated_from)
            statement = statement.where(CrmOrder.updated_at >= start_dt)
        if updated_to:
            _, end_dt = self._period_bounds(updated_to, updated_to)
            statement = statement.where(CrmOrder.updated_at < end_dt)
        if has_comment is True:
            statement = statement.where(CrmOrder.comment.is_not(None))
        elif has_comment is False:
            statement = statement.where(CrmOrder.comment.is_(None))
        if has_documents is True:
            statement = statement.where(CrmOrder.documents.any())
        elif has_documents is False:
            statement = statement.where(~CrmOrder.documents.any())
        statement = self._apply_payment_status_filter(statement, payment_statuses)
        statement = self._apply_client_filter(statement, client_filter)
        if brand_value := (brand or "").strip():
            statement = statement.where(func.lower(CrmVehicle.brand).like(f"%{brand_value.casefold()}%"))
        if model_value := (model or "").strip():
            statement = statement.where(func.lower(CrmVehicle.model).like(f"%{model_value.casefold()}%"))
        if plate_value := (plate or "").strip():
            plate_predicates = [CrmVehicle.plate_search_hash == hash_plate_lookup(candidate) for candidate in build_plate_search_candidates(plate_value)]
            statement = statement.where(or_(*plate_predicates)) if plate_predicates else statement.where(False)
        return statement

    @staticmethod
    def _build_search_predicates(
        *,
        payer_client,
        search_value: str | None,
    ) -> list[object]:
        tokens = OrderRepository._tokenize_search_query(search_value or "")
        if not tokens:
            return []
        return [or_(*OrderRepository._build_token_predicates(payer_client=payer_client, token=token)) for token in tokens]

    @staticmethod
    def _tokenize_search_query(query: str) -> list[str]:
        tokens: list[str] = []
        cursor = 0
        for match in SPECIAL_SEARCH_TOKEN_RE.finditer(query):
            tokens.extend(ORDINARY_SEARCH_TOKEN_RE.findall(query[cursor : match.start()]))
            tokens.append(match.group().strip())
            cursor = match.end()
        tokens.extend(ORDINARY_SEARCH_TOKEN_RE.findall(query[cursor:]))
        return list(dict.fromkeys(token for token in tokens if token))

    @staticmethod
    def _build_token_predicates(*, payer_client, token: str) -> list[object]:
        predicates: list[object] = []
        name_hashes = hash_name_lookup_tokens(token)
        if name_hashes:
            predicates.append(CrmClient.name_search_hashes.contains(name_hashes))
            predicates.append(payer_client.name_search_hashes.contains(name_hashes))

        if not any(character.isalpha() for character in token):
            phone_fragment_hashes = hash_phone_fragment_lookup_candidates(token)
            if phone_fragment_hashes:
                predicates.append(CrmClient.phone_fragment_hashes.overlap(phone_fragment_hashes))
                predicates.append(payer_client.phone_fragment_hashes.overlap(phone_fragment_hashes))

            phone_digits = "".join(character for character in token if character.isdigit())
            if len(phone_digits) >= 10:
                predicates.append(CrmClient.phone_search_hash == hash_phone_lookup(token))
                predicates.append(payer_client.phone_search_hash == hash_phone_lookup(token))

        plate_fragment_hashes = hash_plate_fragment_lookup_candidates(token)
        if plate_fragment_hashes:
            predicates.append(CrmVehicle.plate_fragment_hashes.overlap(plate_fragment_hashes))

        predicates.extend(
            CrmVehicle.plate_search_hash == hash_plate_lookup(candidate)
            for candidate in build_plate_search_candidates(token)
        )
        predicates.extend(
            CrmVehicle.vin_search_hash == hash_vin_lookup(candidate)
            for candidate in build_vin_search_candidates(token)
        )

        compact_token = "".join(character for character in token.casefold() if character.isalnum())
        if compact_token.isdigit():
            predicates.append(cast(CrmOrder.id, String) == compact_token)

        predicates.extend(
            [
                CrmVehicle.brand.ilike(f"%{token}%"),
                CrmVehicle.model.ilike(f"%{token}%"),
                CrmVehicle.brand_ref.has(CrmCarBrand.name.ilike(f"%{token}%")),
                CrmVehicle.model_ref.has(CrmCarModel.name.ilike(f"%{token}%")),
            ]
        )
        if compact_token:
            predicates.extend(
                [
                    CrmVehicle.brand_ref.has(CrmCarBrand.normalized_name == compact_token),
                    CrmVehicle.model_ref.has(CrmCarModel.normalized_name == compact_token),
                ]
            )
        return predicates

    @staticmethod
    def _apply_payment_status_filter(statement, payment_statuses: list[str] | None):
        requested = set(payment_statuses or []) & {"unpaid", "partial", "paid", "overpaid"}
        if not requested:
            return statement

        paid_total = (
            select(func.coalesce(func.sum(CrmOrderPayment.amount), 0))
            .where(CrmOrderPayment.order_id == CrmOrder.id)
            .correlate(CrmOrder)
            .scalar_subquery()
        )
        predicates = []
        if "unpaid" in requested:
            predicates.append(paid_total == 0)
        if "partial" in requested:
            predicates.append(and_(paid_total > 0, paid_total < CrmOrder.amount_to_pay))
        if "paid" in requested:
            predicates.append(and_(paid_total > 0, paid_total >= CrmOrder.amount_to_pay))
        if "overpaid" in requested:
            predicates.append(paid_total > CrmOrder.amount_to_pay)
        return statement.where(or_(*predicates))

    @staticmethod
    def _apply_client_filter(statement, client_filter: str | None):
        value = (client_filter or "").strip()
        if not value:
            return statement

        predicates = []
        name_hashes = hash_name_lookup_tokens(value)
        if name_hashes:
            predicates.append(CrmClient.name_search_hashes.contains(name_hashes))
        phone_value = normalize_phone_search_query(value)
        if phone_value:
            predicates.append(CrmClient.phone_search_hash == hash_phone_lookup(phone_value))
        return statement.where(or_(*predicates)) if predicates else statement.where(False)

    @staticmethod
    def _python_sort_value(order: CrmOrder, key: str):
        if key == "status":
            return order.status_record.sort_order if order.status_record else 999
        if key == "scheduled_for":
            return order.scheduled_for
        if key == "id":
            return order.id
        if key == "updated_at":
            return order.updated_at
        if key == "amount_to_pay":
            return Decimal(order.amount_to_pay)
        if key == "client_full_name":
            return order.client.display_label.casefold()
        if key == "vehicle_plate_number":
            return (order.vehicle.plate_number_normalized or "").casefold()
        if key == "vehicle_brand":
            return (order.vehicle.brand or "").casefold()
        if key == "vehicle_model":
            return (order.vehicle.model or "").casefold()
        return None

    def _compare_orders(
        self,
        left: CrmOrder,
        right: CrmOrder,
        *,
        sort_by: list[str] | None,
        sort_dir: list[str] | None,
    ) -> int:
        sort_keys = sort_by or ["status", "scheduled_for", "id"]
        sort_dirs = list(sort_dir or ["asc", "asc", "desc"])
        while len(sort_dirs) < len(sort_keys):
            sort_dirs.append(sort_dirs[-1] if sort_dirs else "asc")

        for key, direction in zip(sort_keys, sort_dirs, strict=False):
            left_value = self._python_sort_value(left, key)
            right_value = self._python_sort_value(right, key)
            if left_value is None and right_value is None:
                continue
            if left_value is None:
                return 1
            if right_value is None:
                return -1
            comparison = (left_value > right_value) - (left_value < right_value)
            if comparison:
                return comparison if direction.lower() == "asc" else -comparison

        return (right.id > left.id) - (right.id < left.id)

    def _scope_statement(self, *, archived_scope: str | None, search: str | None):
        return self._build_summary_statement(archived_scope=archived_scope, search=search)

    def _build_order_clauses(self, *, sort_by: list[str] | None, sort_dir: list[str] | None):
        sort_keys = sort_by or ["status", "scheduled_for", "id"]
        sort_dirs = list(sort_dir or ["asc", "asc", "desc"])
        while len(sort_dirs) < len(sort_keys):
            sort_dirs.append(sort_dirs[-1] if sort_dirs else "asc")

        clauses = []
        for key, direction in zip(sort_keys, sort_dirs, strict=False):
            normalized_direction = direction.lower()
            if key == "status":
                column = CrmOrderStatus.sort_order
            elif key == "scheduled_for":
                column = CrmOrder.scheduled_for
            elif key == "id":
                column = CrmOrder.id
            elif key == "updated_at":
                column = CrmOrder.updated_at
            elif key == "amount_to_pay":
                column = CrmOrder.amount_to_pay
            elif key == "vehicle_plate_number":
                column = CrmVehicle.plate_number_normalized
            elif key == "vehicle_brand":
                column = func.lower(CrmVehicle.brand)
            elif key == "vehicle_model":
                column = func.lower(CrmVehicle.model)
            else:
                continue

            clause = column.desc() if normalized_direction == "desc" else column.asc()
            if key in {"scheduled_for", "vehicle_brand", "vehicle_model"}:
                clause = clause.nulls_last()
            clauses.append(clause)

        if not clauses:
            clauses = [CrmOrderStatus.sort_order.asc(), CrmOrder.scheduled_for.asc().nulls_last(), CrmOrder.id.desc()]
        elif "id" not in sort_keys:
            clauses.append(CrmOrder.id.desc())
        return clauses
