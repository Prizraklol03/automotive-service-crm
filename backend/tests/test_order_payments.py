from __future__ import annotations

import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.errors import AppError, register_exception_handlers  # noqa: E402
from app.crm.models.audit_log import CrmAuditLog  # noqa: E402
from app.crm.models.car_brand import CrmCarBrand  # noqa: E402
from app.crm.models.car_model import CrmCarModel  # noqa: E402
from app.crm.models.order_payment import CrmOrderPayment, CrmOrderPaymentIdempotency  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.repositories.order_payment_repository import OrderPaymentRepository  # noqa: E402
from app.crm.schemas.order_payment import OrderPaymentUpdate  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.order_payment_service import CrmOrderPaymentService  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class OrderPaymentsApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.db_harness = create_schema_harness(metadata=Base.metadata)
        self.engine = self.db_harness.engine
        self.SessionLocal = self.db_harness.SessionLocal

        self.app = FastAPI()
        register_exception_handlers(self.app)
        self.app.include_router(api_router, prefix="/api")

        def override_get_db():
            session: Session = self.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)

        session = self.SessionLocal()
        try:
            user_service = UserService(session)
            roles = {role.code: role for role in user_service.ensure_default_roles()}
            user_service.create_user(UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="Admin test passphrase 2026!"))
            employee_user = user_service.create_user(
                UserCreate(role_id=roles["standard_user"].id, full_name="Demo Customer 02", login="employee", password="Employee test passphrase 2026!")
            )
            self.employee_user_id = employee_user.id

            brand = CrmCarBrand(name="Lada", normalized_name="lada", sort_order=1, is_active=True)
            session.add(brand)
            session.flush()
            session.add(CrmCarModel(brand_id=brand.id, name="Vesta", normalized_name="vesta", sort_order=1, is_active=True))
            session.add_all(
                [
                    CrmOrderStatus(
                        code="new",
                        display_name="Новый",
                        status_group=StatusGroup.NEW.value,
                        color="#6b7280",
                        sort_order=10,
                        is_default=True,
                    ),
                    CrmOrderStatus(
                        code="in_progress",
                        display_name="В работе",
                        status_group=StatusGroup.IN_PROGRESS.value,
                        color="#2563eb",
                        sort_order=20,
                        is_default=False,
                    ),
                ]
            )
            session.commit()
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()

    def auth_headers(self, login: str = "employee", password: str = "Employee test passphrase 2026!") -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def update_employee_permissions(self, permissions: list[dict[str, object]]) -> None:
        response = self.client.patch(
            f"/api/users/{self.employee_user_id}/permissions",
            json={"permissions": permissions},
            headers=self.auth_headers("admin", "Admin test passphrase 2026!"),
        )
        self.assertEqual(response.status_code, 200, response.text)

    @staticmethod
    def payment_headers(headers: dict[str, str], key: str) -> dict[str, str]:
        return {**headers, "Idempotency-Key": key}

    def create_order(
        self,
        headers: dict[str, str],
        *,
        unit_price: str,
        phone: str = "+70000000020",
        plate: str = "A111AA00",
        client_name: str = "Order Client",
        vin: str | None = None,
    ) -> int:
        client_response = self.client.post(
            "/api/clients",
            json={"full_name": client_name, "phone": phone, "comment": None},
            headers=headers,
        )
        self.assertEqual(client_response.status_code, 201, client_response.text)

        vehicle_response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_response.json()["id"],
                "plate_number": plate,
                "vin": vin,
                "brand_id": 1,
                "model_id": 1,
                "brand": None,
                "model": None,
                "year": 2024,
                "mileage": 100,
                "color": "WHITE",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(vehicle_response.status_code, 201, vehicle_response.text)

        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_response.json()["id"],
                "vehicle_id": vehicle_response.json()["id"],
                "status": "new",
                "comment": None,
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка",
                        "category_name_snapshot": "Услуги",
                        "unit_price": unit_price,
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        return order_response.json()["id"]

    def test_order_services_can_be_zero_priced_and_negative_price_is_rejected(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        order_id = self.create_order(headers, unit_price="0.00")

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        payload = detail.json()
        self.assertEqual(payload["services_total"], "0.00")
        self.assertEqual(payload["amount_to_pay"], "0.00")
        self.assertEqual(payload["paid_total"], "0.00")
        self.assertEqual(payload["balance_due"], "0.00")
        self.assertEqual(payload["payment_status"], "unpaid")

        updated = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": payload["client_id"],
                "vehicle_id": payload["vehicle_id"],
                "status": payload["status"],
                "comment": payload["comment"],
                "discount_value": payload["discount_value"],
                "discount_type": payload["discount_type"],
                "services": payload["services"],
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["services_total"], "0.00")

        negative_order_id = self.create_order(headers, unit_price="0.00", phone="+70000000036", plate="A111AA00")
        negative_update = self.client.put(
            f"/api/orders/{negative_order_id}",
            json={
                "client_id": payload["client_id"],
                "vehicle_id": payload["vehicle_id"],
                "status": "new",
                "comment": None,
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка",
                        "category_name_snapshot": "Услуги",
                        "unit_price": "-1.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(negative_update.status_code, 422, negative_update.text)

    def test_order_payment_crud_updates_totals_and_statuses(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        order_id = self.create_order(headers, unit_price="1000.00")

        create_partial = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "400.00",
                "payment_date": "2026-05-13T10:00:00",
                "payment_method": "cash",
                "comment": "Аванс",
            },
            headers=self.payment_headers(headers, "payment-crud-0003"),
        )
        self.assertEqual(create_partial.status_code, 201, create_partial.text)
        payment_id = create_partial.json()["id"]

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["paid_total"], "400.00")
        self.assertEqual(detail.json()["balance_due"], "600.00")
        self.assertEqual(detail.json()["payment_status"], "partial")
        self.assertEqual(len(detail.json()["payments"]), 1)

        create_full = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "600.00",
                "payment_date": "2026-05-13T11:00:00",
                "payment_method": "transfer",
                "comment": "Остаток",
            },
            headers=self.payment_headers(headers, "payment-crud-0004"),
        )
        self.assertEqual(create_full.status_code, 201, create_full.text)

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["paid_total"], "1000.00")
        self.assertEqual(detail.json()["balance_due"], "0.00")
        self.assertEqual(detail.json()["payment_status"], "paid")
        self.assertEqual(len(detail.json()["payments"]), 2)

        create_overpaid = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "200.00",
                "payment_date": "2026-05-13T12:00:00",
                "payment_method": "card",
                "comment": "Переплата",
            },
            headers=self.payment_headers(headers, "payment-crud-0005"),
        )
        self.assertEqual(create_overpaid.status_code, 201, create_overpaid.text)

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["paid_total"], "1200.00")
        self.assertEqual(detail.json()["balance_due"], "-200.00")
        self.assertEqual(detail.json()["payment_status"], "overpaid")

        negative_payment = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "-1.00",
                "payment_date": "2026-05-13T13:00:00",
                "payment_method": "cash",
                "comment": "bad",
            },
            headers=self.payment_headers(headers, "payment-crud-0006"),
        )
        self.assertEqual(negative_payment.status_code, 422, negative_payment.text)

        zero_payment = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "0.00",
                "payment_date": "2026-05-13T13:00:00",
                "payment_method": "cash",
                "comment": "bad",
            },
            headers=self.payment_headers(headers, "payment-crud-0007"),
        )
        self.assertEqual(zero_payment.status_code, 422, zero_payment.text)

        update_response = self.client.put(
            f"/api/orders/{order_id}/payments/{payment_id}",
            json={
                "amount": "100.00",
                "payment_date": "2026-05-13T10:00:00",
                "payment_method": "cash",
                "comment": "Аванс обновлён",
            },
            headers=headers,
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["paid_total"], "900.00")
        self.assertEqual(detail.json()["balance_due"], "100.00")
        self.assertEqual(detail.json()["payment_status"], "partial")

        delete_response = self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=headers)
        self.assertEqual(delete_response.status_code, 204, delete_response.text)

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["paid_total"], "800.00")
        self.assertEqual(detail.json()["balance_due"], "200.00")
        self.assertEqual(detail.json()["payment_status"], "partial")
        self.assertEqual(len(detail.json()["payments"]), 2)

    def test_order_payments_list_requires_order_view_permission(self) -> None:
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_headers = self.auth_headers()
        order_id = self.create_order(admin_headers, unit_price="1000.00")

        self.update_employee_permissions([{ "permission_code": "orders.view", "is_allowed": False }])

        response = self.client.get(f"/api/orders/{order_id}/payments", headers=employee_headers)
        self.assertEqual(response.status_code, 403, response.text)

    def test_order_payments_write_requires_dedicated_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_headers = self.auth_headers()
        order_id = self.create_order(admin_headers, unit_price="1000.00")

        payment_response = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "400.00",
                "payment_date": "2026-05-13T10:00:00",
                "payment_method": "cash",
                "comment": "Аванс",
            },
            headers=self.payment_headers(admin_headers, "payment-permission-0001"),
        )
        self.assertEqual(payment_response.status_code, 201, payment_response.text)
        payment_id = payment_response.json()["id"]

        list_response = self.client.get(f"/api/orders/{order_id}/payments", headers=employee_headers)
        self.assertEqual(list_response.status_code, 200, list_response.text)

        create_response = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={
                "amount": "100.00",
                "payment_date": "2026-05-13T11:00:00",
                "payment_method": "card",
                "comment": "Без права",
            },
            headers=self.payment_headers(employee_headers, "payment-permission-0002"),
        )
        self.assertEqual(create_response.status_code, 403, create_response.text)

        update_response = self.client.put(
            f"/api/orders/{order_id}/payments/{payment_id}",
            json={
                "amount": "100.00",
                "payment_date": "2026-05-13T10:00:00",
                "payment_method": "cash",
                "comment": "Без права",
            },
            headers=employee_headers,
        )
        self.assertEqual(update_response.status_code, 403, update_response.text)

        delete_response = self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=employee_headers)
        self.assertEqual(delete_response.status_code, 403, delete_response.text)

        missing_order_response = self.client.post(
            "/api/orders/999999/payments",
            json={
                "amount": "100.00",
                "payment_date": "2026-05-13T11:00:00",
                "payment_method": "cash",
                "comment": "Missing order",
            },
            headers=self.payment_headers(admin_headers, "payment-permission-0003"),
        )
        self.assertEqual(missing_order_response.status_code, 404, missing_order_response.text)

    def test_payment_permissions_are_isolated_from_orders_edit(self) -> None:
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_headers = self.auth_headers()
        order_id = self.create_order(admin_headers, unit_price="1000.00")
        payload = {
            "amount": "100.00",
            "payment_date": "2026-05-13T10:00:00",
            "payment_method": "cash",
            "comment": "permission test",
        }

        created = self.client.post(
            f"/api/orders/{order_id}/payments",
            json=payload,
            headers=self.payment_headers(admin_headers, "payment-isolation-0001"),
        )
        self.assertEqual(created.status_code, 201, created.text)
        payment_id = created.json()["id"]

        denied_create = self.client.post(
            f"/api/orders/{order_id}/payments",
            json=payload,
            headers=self.payment_headers(employee_headers, "payment-isolation-0002"),
        )
        denied_edit = self.client.put(f"/api/orders/{order_id}/payments/{payment_id}", json=payload, headers=employee_headers)
        denied_delete = self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=employee_headers)
        self.assertEqual(denied_create.status_code, 403, denied_create.text)
        self.assertEqual(denied_edit.status_code, 403, denied_edit.text)
        self.assertEqual(denied_delete.status_code, 403, denied_delete.text)

        self.update_employee_permissions([{ "permission_code": "orders.payments.create", "is_allowed": True }])
        allowed_create = self.client.post(
            f"/api/orders/{order_id}/payments",
            json=payload,
            headers=self.payment_headers(employee_headers, "payment-isolation-0003"),
        )
        self.assertEqual(allowed_create.status_code, 201, allowed_create.text)
        self.assertEqual(self.client.put(f"/api/orders/{order_id}/payments/{payment_id}", json=payload, headers=employee_headers).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=employee_headers).status_code, 403)

        self.update_employee_permissions(
            [
                {"permission_code": "orders.payments.create", "is_allowed": False},
                {"permission_code": "orders.payments.edit", "is_allowed": True},
            ]
        )
        self.assertEqual(self.client.put(f"/api/orders/{order_id}/payments/{payment_id}", json=payload, headers=employee_headers).status_code, 200)
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order_id}/payments",
                json=payload,
                headers=self.payment_headers(employee_headers, "payment-isolation-0004"),
            ).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=employee_headers).status_code, 403)

        self.update_employee_permissions(
            [
                {"permission_code": "orders.payments.edit", "is_allowed": False},
                {"permission_code": "orders.payments.delete", "is_allowed": True},
            ]
        )
        self.assertEqual(self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=employee_headers).status_code, 204)

    def test_payment_create_idempotency_replays_without_duplicate_audit_event(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        order_id = self.create_order(headers, unit_price="1000.00")
        payload = {
            "amount": "100.00",
            "payment_date": "2026-05-13T10:00:00",
            "payment_method": "cash",
            "comment": "same request",
        }
        request_headers = self.payment_headers(headers, "payment-idempotency-0001")

        first = self.client.post(f"/api/orders/{order_id}/payments", json=payload, headers=request_headers)
        replay = self.client.post(f"/api/orders/{order_id}/payments", json=payload, headers=request_headers)
        changed = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={**payload, "amount": "101.00"},
            headers=request_headers,
        )
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(replay.status_code, 201, replay.text)
        self.assertEqual(first.json()["id"], replay.json()["id"])
        self.assertEqual(changed.status_code, 409, changed.text)

        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmOrderPayment).where(CrmOrderPayment.order_id == order_id)), 1)
            self.assertEqual(
                session.scalar(
                    select(func.count()).select_from(CrmAuditLog).where(
                        CrmAuditLog.entity_type == "order_payment",
                        CrmAuditLog.entity_id == first.json()["id"],
                        CrmAuditLog.action == "create",
                    )
                ),
                1,
            )
        finally:
            session.close()

        missing_key = self.client.post(f"/api/orders/{order_id}/payments", json=payload, headers=headers)
        malformed_key = self.client.post(
            f"/api/orders/{order_id}/payments",
            json=payload,
            headers=self.payment_headers(headers, "short"),
        )
        too_long_key = self.client.post(
            f"/api/orders/{order_id}/payments",
            json=payload,
            headers=self.payment_headers(headers, "a" * 129),
        )
        self.assertEqual(missing_key.status_code, 422, missing_key.text)
        self.assertEqual(malformed_key.status_code, 422, malformed_key.text)
        self.assertEqual(too_long_key.status_code, 422, too_long_key.text)

    def test_payment_create_concurrent_same_key_creates_one_payment(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        order_id = self.create_order(headers, unit_price="1000.00")
        payload = {
            "amount": "100.00",
            "payment_date": "2026-05-13T10:00:00",
            "payment_method": "cash",
            "comment": "concurrent request",
        }
        request_headers = self.payment_headers(headers, "payment-concurrent-0001")

        def create_payment() -> int:
            response = self.client.post(f"/api/orders/{order_id}/payments", json=payload, headers=request_headers)
            return response.status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(lambda _: create_payment(), range(2)))
        self.assertEqual(statuses, [201, 201])

        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmOrderPayment).where(CrmOrderPayment.order_id == order_id)), 1)
        finally:
            session.close()

    def test_deleted_payment_keeps_idempotency_tombstone_and_rejects_replay(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        order_id = self.create_order(headers, unit_price="1000.00")
        payload = {
            "amount": "100.00",
            "payment_date": "2026-05-13T10:00:00",
            "payment_method": "cash",
            "comment": "durable idempotency",
        }
        request_headers = self.payment_headers(headers, "payment-tombstone-0001")
        created = self.client.post(f"/api/orders/{order_id}/payments", json=payload, headers=request_headers)
        self.assertEqual(created.status_code, 201, created.text)
        payment_id = created.json()["id"]

        deleted = self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=headers)
        same_replay = self.client.post(f"/api/orders/{order_id}/payments", json=payload, headers=request_headers)
        changed_replay = self.client.post(
            f"/api/orders/{order_id}/payments",
            json={**payload, "amount": "101.00"},
            headers=request_headers,
        )
        update_after_delete = self.client.put(
            f"/api/orders/{order_id}/payments/{payment_id}",
            json=payload,
            headers=headers,
        )
        repeated_delete = self.client.delete(f"/api/orders/{order_id}/payments/{payment_id}", headers=headers)

        self.assertEqual(deleted.status_code, 204, deleted.text)
        self.assertEqual(same_replay.status_code, 409, same_replay.text)
        self.assertEqual(changed_replay.status_code, 409, changed_replay.text)
        self.assertEqual(update_after_delete.status_code, 404, update_after_delete.text)
        self.assertEqual(repeated_delete.status_code, 404, repeated_delete.text)

        session = self.SessionLocal()
        try:
            tombstone = session.scalar(
                select(CrmOrderPaymentIdempotency).where(CrmOrderPaymentIdempotency.order_id == order_id)
            )
            self.assertIsNotNone(tombstone)
            self.assertIsNone(tombstone.payment_id)
            self.assertEqual(
                session.scalar(select(func.count()).select_from(CrmOrderPayment).where(CrmOrderPayment.order_id == order_id)),
                0,
            )
            audit_counts = dict(
                session.execute(
                    select(CrmAuditLog.action, func.count())
                    .where(CrmAuditLog.entity_type == "order_payment", CrmAuditLog.entity_id == payment_id)
                    .group_by(CrmAuditLog.action)
                ).all()
            )
            self.assertEqual(audit_counts, {"create": 1, "delete": 1})
        finally:
            session.close()

    def test_concurrent_delete_blocks_update_and_records_only_successful_audit(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        order_id = self.create_order(headers, unit_price="1000.00")
        payload = {
            "amount": "100.00",
            "payment_date": "2026-05-13T10:00:00",
            "payment_method": "cash",
            "comment": "concurrent mutation",
        }
        created = self.client.post(
            f"/api/orders/{order_id}/payments",
            json=payload,
            headers=self.payment_headers(headers, "payment-mutation-0001"),
        )
        self.assertEqual(created.status_code, 201, created.text)
        payment_id = created.json()["id"]
        locked = threading.Event()
        release_delete = threading.Event()
        update_started = threading.Event()

        def delete_while_holding_lock() -> int:
            session = self.SessionLocal()
            try:
                repository = OrderPaymentRepository(session)
                self.assertIsNotNone(repository.get_by_order_and_id_for_update(order_id, payment_id))
                locked.set()
                self.assertTrue(release_delete.wait(timeout=5))
                CrmOrderPaymentService(session).delete(order_id, payment_id)
                return 204
            finally:
                session.close()

        def update_while_delete_is_locked() -> int:
            self.assertTrue(locked.wait(timeout=5))
            session = self.SessionLocal()
            try:
                update_started.set()
                CrmOrderPaymentService(session).update(
                    order_id,
                    payment_id,
                    OrderPaymentUpdate.model_validate({**payload, "amount": "200.00"}),
                )
                return 200
            except AppError as error:
                session.rollback()
                return error.status_code
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            delete_future = executor.submit(delete_while_holding_lock)
            self.assertTrue(locked.wait(timeout=5))
            update_future = executor.submit(update_while_delete_is_locked)
            self.assertTrue(update_started.wait(timeout=5))
            try:
                with self.assertRaises(FutureTimeoutError):
                    update_future.result(timeout=0.2)
            finally:
                release_delete.set()
            self.assertEqual(delete_future.result(timeout=5), 204)
            self.assertEqual(update_future.result(timeout=5), 404)

        session = self.SessionLocal()
        try:
            self.assertIsNone(session.get(CrmOrderPayment, payment_id))
            audit_counts = dict(
                session.execute(
                    select(CrmAuditLog.action, func.count())
                    .where(CrmAuditLog.entity_type == "order_payment", CrmAuditLog.entity_id == payment_id)
                    .group_by(CrmAuditLog.action)
                ).all()
            )
            self.assertEqual(audit_counts, {"create": 1, "delete": 1})
        finally:
            session.close()

    def test_payment_mutation_cannot_cross_order_boundary(self) -> None:
        headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        first_order_id = self.create_order(headers, unit_price="1000.00")
        second_order_id = self.create_order(
            headers,
            unit_price="2000.00",
            phone="+70000000036",
            plate="A112AA00",
        )
        payload = {
            "amount": "100.00",
            "payment_date": "2026-05-13T10:00:00",
            "payment_method": "cash",
            "comment": "order ownership",
        }
        created = self.client.post(
            f"/api/orders/{first_order_id}/payments",
            json=payload,
            headers=self.payment_headers(headers, "payment-ownership-0001"),
        )
        self.assertEqual(created.status_code, 201, created.text)
        payment_id = created.json()["id"]

        cross_update = self.client.put(
            f"/api/orders/{second_order_id}/payments/{payment_id}",
            json={**payload, "amount": "999.00"},
            headers=headers,
        )
        cross_delete = self.client.delete(
            f"/api/orders/{second_order_id}/payments/{payment_id}",
            headers=headers,
        )
        self.assertEqual(cross_update.status_code, 404, cross_update.text)
        self.assertEqual(cross_delete.status_code, 404, cross_delete.text)

        session = self.SessionLocal()
        try:
            payment = session.get(CrmOrderPayment, payment_id)
            self.assertIsNotNone(payment)
            self.assertEqual(payment.order_id, first_order_id)
            self.assertEqual(str(payment.amount), "100.00")
            self.assertEqual(
                session.scalar(
                    select(func.count()).select_from(CrmAuditLog).where(
                        CrmAuditLog.entity_type == "order_payment",
                        CrmAuditLog.entity_id == payment_id,
                        CrmAuditLog.action.in_(("update", "delete")),
                    )
                ),
                0,
            )
        finally:
            session.close()

    def test_alternate_pii_response_paths_use_masked_projection_without_personal_data_view(self) -> None:
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_headers = self.auth_headers()
        client_marker = "PII_CLIENT_4242"
        plate_marker = "P4242II"
        vin_marker = "VINPII4242XYZ"
        order_id = self.create_order(
            admin_headers,
            unit_price="1000.00",
            client_name=client_marker,
            phone="+70000000037",
            plate=plate_marker,
            vin=vin_marker,
        )
        order_detail = self.client.get(f"/api/orders/{order_id}", headers=admin_headers)
        self.assertEqual(order_detail.status_code, 200, order_detail.text)
        self.assertIn(client_marker, order_detail.text)
        self.assertIn(plate_marker, order_detail.text)
        client_id = order_detail.json()["client_id"]
        vehicle_id = order_detail.json()["vehicle_id"]

        authorized_paths = [
            "/api/clients",
            f"/api/clients/{client_id}",
            f"/api/clients/{client_id}/summary",
            "/api/vehicles",
            f"/api/vehicles/by-plate/{plate_marker}",
            f"/api/vehicles/{vehicle_id}",
            f"/api/vehicles/{vehicle_id}/summary",
            "/api/orders",
            "/api/orders?page=1&page_size=20",
            f"/api/orders/{order_id}",
        ]
        for path in authorized_paths:
            response = self.client.get(path, headers=admin_headers)
            self.assertEqual(response.status_code, 200, f"{path}: {response.text}")
            self.assertTrue(
                client_marker in response.text or plate_marker in response.text or vin_marker in response.text,
                path,
            )

        self.update_employee_permissions([{ "permission_code": "personal_data.view", "is_allowed": False }])
        response_paths = [
            "/api/clients",
            "/api/clients/search?q=PII",
            f"/api/clients/{client_id}",
            f"/api/clients/{client_id}/summary",
            f"/api/clients/{client_id}/orders",
            f"/api/clients/{client_id}/services-history",
            "/api/vehicles",
            "/api/vehicles/search?q=P4242",
            f"/api/vehicles/by-plate/{plate_marker}",
            f"/api/vehicles/{vehicle_id}",
            f"/api/vehicles/{vehicle_id}/summary",
            f"/api/vehicles/{vehicle_id}/orders",
            f"/api/vehicles/{vehicle_id}/services-history",
            "/api/orders",
            "/api/orders?page=1&page_size=20",
            "/api/orders/search?q=PII",
            "/api/orders/archive",
            f"/api/orders/{order_id}",
        ]
        for path in response_paths:
            response = self.client.get(path, headers=employee_headers)
            self.assertEqual(response.status_code, 200, f"{path}: {response.text}")
            self.assertNotIn(client_marker, response.text, path)
            self.assertNotIn(plate_marker, response.text, path)
            self.assertNotIn(vin_marker, response.text, path)


if __name__ == "__main__":
    unittest.main()
