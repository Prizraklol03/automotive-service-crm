from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time import app_now_naive, to_app_naive
from app.crm.models.order import CrmOrder
from app.crm.models.order_payment import CrmOrderPayment, CrmOrderPaymentIdempotency, OrderPaymentMethod
from app.crm.repositories.order_payment_repository import OrderPaymentRepository
from app.crm.repositories.order_repository import OrderRepository
from app.crm.schemas.order_payment import OrderPaymentCreate, OrderPaymentUpdate
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.order_calculation_service import OrderCalculationService


@dataclass(slots=True)
class OrderPaymentTotals:
    paid_total: Decimal
    balance_due: Decimal
    payment_status: str


def summarize_order_payments(order: CrmOrder) -> OrderPaymentTotals:
    amount_to_pay = OrderCalculationService.quantize(Decimal(order.amount_to_pay or Decimal("0.00")))
    paid_total = OrderCalculationService.quantize(
        sum((Decimal(payment.amount or Decimal("0.00")) for payment in order.payments), Decimal("0.00"))
    )
    balance_due = OrderCalculationService.quantize(amount_to_pay - paid_total)

    if paid_total == 0:
        payment_status = "unpaid"
    elif paid_total < amount_to_pay:
        payment_status = "partial"
    elif paid_total == amount_to_pay:
        payment_status = "paid"
    else:
        payment_status = "overpaid"

    return OrderPaymentTotals(paid_total=paid_total, balance_due=balance_due, payment_status=payment_status)


class CrmOrderPaymentService:
    _IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")

    def __init__(self, session: Session) -> None:
        self.session = session
        self.orders = OrderRepository(session)
        self.payments = OrderPaymentRepository(session)
        self.audit_logs = AuditLogService(session)

    def _get_order(self, order_id: int) -> CrmOrder:
        order = self.orders.get_by_id(order_id)
        if not order:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)
        return order

    def _get_payment(self, order_id: int, payment_id: int) -> CrmOrderPayment:
        payment = self.payments.get_by_order_and_id_for_update(order_id, payment_id)
        if not payment:
            raise AppError(code="not_found", message="Платёж не найден", status_code=404)
        return payment

    @staticmethod
    def _normalize_comment(comment: str | None) -> str | None:
        text = comment.strip() if comment else ""
        return text or None

    @staticmethod
    def _normalize_payment_date(payment_date: datetime) -> datetime:
        return to_app_naive(payment_date)

    @staticmethod
    def _normalize_payment_method(payment_method: OrderPaymentMethod | str) -> OrderPaymentMethod:
        value = payment_method.value if isinstance(payment_method, OrderPaymentMethod) else str(payment_method)
        normalized = value.strip().lower()
        try:
            return OrderPaymentMethod(normalized)
        except ValueError as exc:
            raise AppError(
                code="validation_error",
                message="Некорректный способ оплаты",
                status_code=422,
                details={"field": "payment_method"},
            ) from exc

    @staticmethod
    def _normalize_amount(amount: Decimal) -> Decimal:
        normalized = OrderCalculationService.quantize(Decimal(amount))
        if normalized <= 0:
            raise AppError(
                code="validation_error",
                message="Сумма платежа должна быть больше 0",
                status_code=422,
                details={"field": "amount"},
            )
        return normalized

    @classmethod
    def _idempotency_digest(cls, key: str) -> str:
        if not cls._IDEMPOTENCY_KEY_RE.fullmatch(key):
            raise AppError(
                code="validation_error",
                message="Invalid Idempotency-Key",
                status_code=422,
                details={"field": "Idempotency-Key"},
            )
        return hashlib.sha256(key.encode("utf-8")).hexdigest()

    @staticmethod
    def _fingerprint(
        *,
        amount: Decimal,
        payment_date: datetime,
        payment_method: OrderPaymentMethod,
        comment: str | None,
    ) -> str:
        normalized = json.dumps(
            {
                "amount": format(amount, ".2f"),
                "comment": comment,
                "payment_date": payment_date.isoformat(),
                "payment_method": payment_method.value,
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _resolve_idempotency_replay(
        self,
        record: CrmOrderPaymentIdempotency,
        *,
        fingerprint: str,
    ) -> CrmOrderPayment:
        if record.payload_fingerprint != fingerprint:
            raise AppError(code="conflict", message="Idempotency-Key payload conflict", status_code=409)
        if record.payment_id is None:
            raise AppError(code="conflict", message="Idempotency-Key belongs to a deleted payment", status_code=409)
        payment = self.payments.get_by_id(record.payment_id) or record.payment
        if payment is None:
            raise AppError(code="conflict", message="Idempotency-Key payment is unavailable", status_code=409)
        return payment

    def list_by_order(self, order_id: int) -> list[CrmOrderPayment]:
        self._get_order(order_id)
        return self.payments.list_by_order(order_id)

    def create(
        self,
        order_id: int,
        payload: OrderPaymentCreate,
        *,
        idempotency_key: str,
        actor_user_id: int | None = None,
    ) -> CrmOrderPayment:
        self._get_order(order_id)
        amount = self._normalize_amount(payload.amount)
        payment_date = self._normalize_payment_date(payload.payment_date)
        payment_method = self._normalize_payment_method(payload.payment_method)
        comment = self._normalize_comment(payload.comment)
        key_digest = self._idempotency_digest(idempotency_key)
        fingerprint = self._fingerprint(
            amount=amount,
            payment_date=payment_date,
            payment_method=payment_method,
            comment=comment,
        )
        existing = self.payments.get_idempotency(order_id, key_digest)
        if existing:
            return self._resolve_idempotency_replay(existing, fingerprint=fingerprint)
        payment = CrmOrderPayment(
            order_id=order_id,
            amount=amount,
            payment_date=payment_date,
            payment_method=payment_method,
            comment=comment,
            created_by_user_id=actor_user_id,
        )
        self.payments.create(payment)
        self.payments.create_idempotency(
            CrmOrderPaymentIdempotency(
                order_id=order_id,
                payment_id=payment.id,
                key_digest=key_digest,
                payload_fingerprint=fingerprint,
            )
        )
        try:
            self.session.flush()
        except IntegrityError:
            self.session.rollback()
            existing = self.payments.get_idempotency(order_id, key_digest)
            if existing is None:
                raise
            return self._resolve_idempotency_replay(existing, fingerprint=fingerprint)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="order_payment",
            entity_id=payment.id,
            action="create",
            title=f"Добавлена оплата к заказу #{order_id}",
            description=f"{payment.amount} ₽, {payment.payment_method.value}",
        )
        self.session.commit()
        return self.payments.get_by_id(payment.id) or payment

    def update(
        self,
        order_id: int,
        payment_id: int,
        payload: OrderPaymentUpdate,
        *,
        actor_user_id: int | None = None,
    ) -> CrmOrderPayment:
        payment = self._get_payment(order_id, payment_id)
        payment.amount = self._normalize_amount(payload.amount)
        payment.payment_date = self._normalize_payment_date(payload.payment_date)
        payment.payment_method = self._normalize_payment_method(payload.payment_method)
        payment.comment = self._normalize_comment(payload.comment)
        payment.updated_at = app_now_naive()
        self.session.flush()
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="order_payment",
            entity_id=payment.id,
            action="update",
            title=f"Изменена оплата по заказу #{order_id}",
            description=f"{payment.amount} ₽, {payment.payment_method.value}",
        )
        self.session.commit()
        return self.payments.get_by_id(payment.id) or payment

    def delete(self, order_id: int, payment_id: int, *, actor_user_id: int | None = None) -> None:
        payment = self._get_payment(order_id, payment_id)
        audit_amount = payment.amount
        audit_method = payment.payment_method.value
        self.payments.delete(payment)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="order_payment",
            entity_id=payment.id,
            action="delete",
            title=f"Удалена оплата по заказу #{order_id}",
            description=f"{audit_amount} ₽, {audit_method}",
        )
        self.session.commit()
