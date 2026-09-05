from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.order_payment import CrmOrderPayment, CrmOrderPaymentIdempotency
from app.crm.models.user import CrmUser


class OrderPaymentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, payment: CrmOrderPayment) -> CrmOrderPayment:
        self.session.add(payment)
        self.session.flush()
        return payment

    def get_by_id(self, payment_id: int) -> CrmOrderPayment | None:
        statement = (
            select(CrmOrderPayment)
            .options(
                selectinload(CrmOrderPayment.order),
                selectinload(CrmOrderPayment.created_by_user).selectinload(CrmUser.role),
            )
            .where(CrmOrderPayment.id == payment_id)
        )
        return self.session.scalar(statement)

    def get_by_order_and_id_for_update(self, order_id: int, payment_id: int) -> CrmOrderPayment | None:
        statement = (
            select(CrmOrderPayment)
            .options(
                selectinload(CrmOrderPayment.order),
                selectinload(CrmOrderPayment.created_by_user).selectinload(CrmUser.role),
            )
            .where(CrmOrderPayment.order_id == order_id, CrmOrderPayment.id == payment_id)
            .with_for_update()
        )
        return self.session.scalar(statement)

    def list_by_order(self, order_id: int) -> list[CrmOrderPayment]:
        statement = (
            select(CrmOrderPayment)
            .options(selectinload(CrmOrderPayment.created_by_user).selectinload(CrmUser.role))
            .where(CrmOrderPayment.order_id == order_id)
            .order_by(
                CrmOrderPayment.payment_date.desc(),
                CrmOrderPayment.created_at.desc(),
                CrmOrderPayment.id.desc(),
            )
        )
        return list(self.session.scalars(statement))

    def delete(self, payment: CrmOrderPayment) -> None:
        self.session.delete(payment)
        self.session.flush()

    def get_idempotency(self, order_id: int, key_digest: str) -> CrmOrderPaymentIdempotency | None:
        return self.session.scalar(
            select(CrmOrderPaymentIdempotency).where(
                CrmOrderPaymentIdempotency.order_id == order_id,
                CrmOrderPaymentIdempotency.key_digest == key_digest,
            )
        )

    def create_idempotency(self, record: CrmOrderPaymentIdempotency) -> CrmOrderPaymentIdempotency:
        self.session.add(record)
        return record
