from __future__ import annotations

import unittest
from datetime import datetime
from decimal import Decimal
from unittest.mock import Mock

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.order_payment import (
    CrmOrderPayment,
    CrmOrderPaymentIdempotency,
    OrderPaymentMethod,
)
from app.crm.repositories.order_payment_repository import OrderPaymentRepository
from app.crm.schemas.order_payment import OrderPaymentCreate, OrderPaymentUpdate
from app.crm.services.order_payment_service import CrmOrderPaymentService


class OrderPaymentStabilizationUnitTestCase(unittest.TestCase):
    @staticmethod
    def payload(*, amount: str = "100.00") -> OrderPaymentCreate:
        return OrderPaymentCreate(
            amount=Decimal(amount),
            payment_date=datetime(2026, 5, 13, 10, 0),
            payment_method=OrderPaymentMethod.CASH,
            comment="durable idempotency",
        )

    def make_service(self) -> CrmOrderPaymentService:
        session = Mock(spec=Session)
        service = CrmOrderPaymentService(session)
        service.orders = Mock()
        service.payments = Mock()
        service.audit_logs = Mock()
        service.orders.get_by_id.return_value = object()
        return service

    def test_deleted_payment_tombstone_rejects_same_and_changed_payload_without_side_effects(self) -> None:
        service = self.make_service()
        payload = self.payload()
        fingerprint = service._fingerprint(
            amount=payload.amount,
            payment_date=payload.payment_date,
            payment_method=payload.payment_method,
            comment=payload.comment,
        )
        service.payments.get_idempotency.return_value = CrmOrderPaymentIdempotency(
            order_id=7,
            payment_id=None,
            key_digest="a" * 64,
            payload_fingerprint=fingerprint,
        )

        for replay_payload in (payload, self.payload(amount="101.00")):
            with self.assertRaises(AppError) as raised:
                service.create(7, replay_payload, idempotency_key="payment-tombstone-0001")
            self.assertEqual(raised.exception.status_code, 409)

        service.payments.create.assert_not_called()
        service.payments.create_idempotency.assert_not_called()
        service.audit_logs.record.assert_not_called()
        service.session.commit.assert_not_called()

    def test_mutation_lookup_uses_postgresql_for_update_and_order_ownership(self) -> None:
        session = Mock(spec=Session)
        repository = OrderPaymentRepository(session)
        repository.get_by_order_and_id_for_update(order_id=7, payment_id=11)

        statement = session.scalar.call_args.args[0]
        sql = str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        self.assertIn("crm_order_payments.order_id = 7", sql)
        self.assertIn("crm_order_payments.id = 11", sql)
        self.assertIn("FOR UPDATE", sql)

    def test_failed_update_flush_does_not_record_audit_or_commit(self) -> None:
        service = self.make_service()
        service.payments.get_by_order_and_id_for_update.return_value = CrmOrderPayment(
            id=11,
            order_id=7,
            amount=Decimal("100.00"),
            payment_date=datetime(2026, 5, 13, 10, 0),
            payment_method=OrderPaymentMethod.CASH,
        )
        service.session.flush.side_effect = RuntimeError("synthetic update failure")

        with self.assertRaisesRegex(RuntimeError, "synthetic update failure"):
            service.update(7, 11, OrderPaymentUpdate.model_validate(self.payload().model_dump()))

        service.audit_logs.record.assert_not_called()
        service.session.commit.assert_not_called()

    def test_failed_delete_flush_does_not_record_audit_or_commit(self) -> None:
        service = self.make_service()
        service.payments.get_by_order_and_id_for_update.return_value = CrmOrderPayment(
            id=11,
            order_id=7,
            amount=Decimal("100.00"),
            payment_date=datetime(2026, 5, 13, 10, 0),
            payment_method=OrderPaymentMethod.CASH,
        )
        service.payments.delete.side_effect = RuntimeError("synthetic delete failure")

        with self.assertRaisesRegex(RuntimeError, "synthetic delete failure"):
            service.delete(7, 11)

        service.audit_logs.record.assert_not_called()
        service.session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
