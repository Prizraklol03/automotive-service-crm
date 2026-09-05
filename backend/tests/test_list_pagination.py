from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.crm.models.document import CrmDocument  # noqa: E402
from app.crm.models.document_template import CrmDocumentTemplate, DocumentType  # noqa: E402
from app.crm.models.order import CrmOrder  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.models.user import CrmUser  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class ListPaginationTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.db_harness = create_schema_harness(metadata=Base.metadata)
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
            user_service.create_user(
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="admin-test-pass-2026")
            )
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
                    CrmOrderStatus(
                        code="closed",
                        display_name="Выдан",
                        status_group=StatusGroup.CLOSED.value,
                        color="#0f766e",
                        sort_order=40,
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

    def auth_headers(self) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": "admin", "password": "admin-test-pass-2026"})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def create_client(self, headers: dict[str, str], *, full_name: str, phone: str = "+70000000001") -> int:
        response = self.client.post(
            "/api/clients",
            json={"full_name": full_name, "phone": phone, "telegram_username": None, "comment": None},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_vehicle(
        self,
        headers: dict[str, str],
        *,
        client_id: int,
        plate_number: str,
        brand: str,
        model: str = "Model",
    ) -> int:
        response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": plate_number,
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": brand,
                "model": model,
                "year": 2022,
                "mileage": 1000,
                "color": "BLACK",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_order(
        self,
        headers: dict[str, str],
        *,
        client_id: int,
        vehicle_id: int,
        comment: str | None,
        scheduled_for: str | None = None,
        status: str = "new",
        unit_price: str = "1000.00",
    ) -> int:
        response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": status,
                "comment": comment,
                "discount_value": "0.00",
                "discount_type": "fixed",
                "due_date": None,
                "scheduled_for": scheduled_for,
                "handover_at": None,
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Wash",
                        "category_name_snapshot": "Detailing",
                        "unit_price": unit_price,
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_material(self, headers: dict[str, str], *, expense_date: date, name: str) -> int:
        response = self.client.post(
            "/api/materials",
            json={
                "expense_date": expense_date.isoformat(),
                "material_name": name,
                "quantity": 2,
                "service_category_id": None,
                "unit_price": "150.00",
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_finance_expense(self, headers: dict[str, str], *, expense_date: date, amount: str) -> int:
        categories_response = self.client.get("/api/finance/categories", headers=headers)
        self.assertEqual(categories_response.status_code, 200, categories_response.text)
        category_id = categories_response.json()[0]["id"]

        response = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": expense_date.isoformat(),
                "category_id": category_id,
                "comment": "Stationery",
                "amount": amount,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_orders_clients_and_vehicles_use_paginated_list_contract(self) -> None:
        headers = self.auth_headers()

        client_id = self.create_client(headers, full_name="Demo Customer 03", phone="+70000000001")
        self.create_client(headers, full_name="Demo Customer 15", phone="+70000000002")
        vehicle_a = self.create_vehicle(headers, client_id=client_id, plate_number="A111AA00", brand="Lada")
        vehicle_b = self.create_vehicle(headers, client_id=client_id, plate_number="B222BB00", brand="Lada")
        self.create_order(headers, client_id=client_id, vehicle_id=vehicle_a, comment="First order")
        self.create_order(headers, client_id=client_id, vehicle_id=vehicle_b, comment="Second order")

        orders_page_1 = self.client.get(
            "/api/orders?search=Ivan&page=1&page_size=1&sort_by=id&sort_dir=desc",
            headers=headers,
        )
        self.assertEqual(orders_page_1.status_code, 200, orders_page_1.text)
        self.assertEqual(orders_page_1.json()["total"], 2)
        self.assertEqual(orders_page_1.json()["page"], 1)
        self.assertEqual(orders_page_1.json()["page_size"], 1)
        self.assertEqual(len(orders_page_1.json()["items"]), 1)
        self.assertNotIn("services", orders_page_1.json()["items"][0])
        self.assertNotIn("payments", orders_page_1.json()["items"][0])

        orders_page_2 = self.client.get(
            "/api/orders?search=Ivan&page=2&page_size=1&sort_by=id&sort_dir=desc",
            headers=headers,
        )
        self.assertEqual(orders_page_2.status_code, 200, orders_page_2.text)
        self.assertEqual(orders_page_2.json()["total"], 2)
        self.assertEqual(orders_page_2.json()["page"], 2)
        self.assertEqual(orders_page_2.json()["page_size"], 1)

        orders_summary = self.client.get("/api/orders/summary?search=Ivan", headers=headers)
        self.assertEqual(orders_summary.status_code, 200, orders_summary.text)
        self.assertEqual(orders_summary.json()["total"], 2)

        second_order = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_b,
                "status": "new",
                "comment": "Archived order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "due_date": None,
                "scheduled_for": None,
                "handover_at": None,
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Wash",
                        "category_name_snapshot": "Detailing",
                        "unit_price": "1000.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(second_order.status_code, 201, second_order.text)
        second_order_id = second_order.json()["id"]

        closed_order = self.client.patch(
            f"/api/orders/{second_order_id}/status",
            json={"status": "closed", "completed_at": None},
            headers=headers,
        )
        self.assertEqual(closed_order.status_code, 200, closed_order.text)
        self.assertTrue(closed_order.json()["is_archived"])

        active_summary = self.client.get("/api/orders/summary?archived_scope=active&search=Ivan", headers=headers)
        self.assertEqual(active_summary.status_code, 200, active_summary.text)
        self.assertEqual(active_summary.json()["total"], 3)
        self.assertEqual(active_summary.json()["active_total"], 2)
        self.assertEqual(active_summary.json()["archived_total"], 1)

        archived_summary = self.client.get("/api/orders/summary?archived_scope=archived&search=Ivan", headers=headers)
        self.assertEqual(archived_summary.status_code, 200, archived_summary.text)
        self.assertEqual(archived_summary.json()["total"], 3)
        self.assertEqual(archived_summary.json()["active_total"], 2)
        self.assertEqual(archived_summary.json()["archived_total"], 1)

        clients_page = self.client.get("/api/clients?q=Ivan&page=1&page_size=1&sort_by=full_name&sort_dir=asc", headers=headers)
        self.assertEqual(clients_page.status_code, 200, clients_page.text)
        self.assertEqual(clients_page.json()["total"], 2)
        self.assertEqual(clients_page.json()["page"], 1)
        self.assertEqual(clients_page.json()["page_size"], 1)
        self.assertNotIn("orders", clients_page.json()["items"][0])

        vehicles_page = self.client.get("/api/vehicles?q=Lada&page=1&page_size=1&sort_by=plate_number_display&sort_dir=asc", headers=headers)
        self.assertEqual(vehicles_page.status_code, 200, vehicles_page.text)
        self.assertEqual(vehicles_page.json()["total"], 2)
        self.assertEqual(vehicles_page.json()["page"], 1)
        self.assertEqual(vehicles_page.json()["page_size"], 1)
        self.assertNotIn("orders", vehicles_page.json()["items"][0])
        self.assertNotIn("owner_history", vehicles_page.json()["items"][0])

    def test_orders_support_extended_filters_and_prioritized_multi_sort(self) -> None:
        headers = self.auth_headers()
        client_a = self.create_client(headers, full_name="Demo Customer 16", phone="+70000000029")
        client_b = self.create_client(headers, full_name="Demo Customer 17", phone="+70000000030")
        client_c = self.create_client(headers, full_name="Demo Customer 18", phone="+70000000031")
        vehicle_a = self.create_vehicle(
            headers,
            client_id=client_a,
            plate_number="Z999ZZ77",
            brand="BMW",
            model="X5",
        )
        vehicle_b = self.create_vehicle(
            headers,
            client_id=client_b,
            plate_number="A111AA00",
            brand="Audi",
            model="A4",
        )
        vehicle_c = self.create_vehicle(
            headers,
            client_id=client_c,
            plate_number="B222BB00",
            brand="Ford",
            model="Q7",
        )
        order_a = self.create_order(
            headers,
            client_id=client_a,
            vehicle_id=vehicle_a,
            comment="Customer comment",
            scheduled_for="2026-05-12T12:00:00",
            unit_price="3000.00",
        )
        order_b = self.create_order(
            headers,
            client_id=client_b,
            vehicle_id=vehicle_b,
            comment=None,
            scheduled_for="2026-05-10T09:00:00",
            status="in_progress",
            unit_price="1000.00",
        )
        order_c = self.create_order(
            headers,
            client_id=client_c,
            vehicle_id=vehicle_c,
            comment="Second comment",
            scheduled_for="2026-05-11T10:00:00",
            unit_price="2000.00",
        )

        for order_id, amount, key in (
            (order_b, "500.00", "pagination-payment-partial"),
            (order_c, "2000.00", "pagination-payment-paid"),
        ):
            payment = self.client.post(
                f"/api/orders/{order_id}/payments",
                json={
                    "amount": amount,
                    "payment_date": "2026-05-13T10:00:00",
                    "payment_method": "cash",
                    "comment": None,
                },
                headers={**headers, "Idempotency-Key": key},
            )
            self.assertEqual(payment.status_code, 201, payment.text)

        session = self.SessionLocal()
        try:
            admin_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "admin"))
            template = CrmDocumentTemplate(
                code=DocumentType.WORK_ORDER,
                name="Work order",
                storage_path="unused.docx",
                is_active=True,
            )
            session.add(template)
            session.flush()
            session.add(
                CrmDocument(
                    order_id=order_a,
                    template_id=template.id,
                    created_by_user_id=admin_id,
                    document_type=DocumentType.WORK_ORDER,
                    document_number=order_a,
                )
            )
            updated_values = {
                order_a: datetime(2026, 5, 13, 12, 0),
                order_b: datetime(2026, 5, 10, 9, 0),
                order_c: datetime(2026, 5, 11, 10, 0),
            }
            for order_id, updated_at in updated_values.items():
                session.get(CrmOrder, order_id).updated_at = updated_at
            session.commit()
        finally:
            session.close()

        def listed(**params: object) -> list[dict[str, object]]:
            response = self.client.get(
                "/api/orders",
                params={"page": 1, "page_size": 50, **params},
                headers=headers,
            )
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()["items"]

        expected_by_sort = {
            "status": [order_c, order_a, order_b],
            "scheduled_for": [order_b, order_c, order_a],
            "id": [order_a, order_b, order_c],
            "updated_at": [order_b, order_c, order_a],
            "amount_to_pay": [order_b, order_c, order_a],
            "client_full_name": [order_b, order_c, order_a],
            "vehicle_plate_number": [order_b, order_c, order_a],
            "vehicle_brand": [order_b, order_a, order_c],
            "vehicle_model": [order_b, order_c, order_a],
        }
        for sort_key, expected_ids in expected_by_sort.items():
            with self.subTest(sort_key=sort_key):
                self.assertEqual(
                    [item["id"] for item in listed(sort_by=sort_key, sort_dir="asc")],
                    expected_ids,
                )

        self.assertEqual(
            [item["id"] for item in listed(sort_by="status,amount_to_pay", sort_dir="asc,desc")],
            [order_a, order_c, order_b],
        )
        self.assertEqual(
            [item["id"] for item in listed(status="new", sort_by="amount_to_pay", sort_dir="asc")],
            [order_c, order_a],
        )
        self.assertEqual([item["id"] for item in listed(scheduled_from="2026-05-11", scheduled_to="2026-05-11")], [order_c])
        self.assertEqual([item["id"] for item in listed(updated_from="2026-05-10", updated_to="2026-05-10")], [order_b])
        self.assertEqual([item["id"] for item in listed(payment_status="unpaid")], [order_a])
        self.assertEqual([item["id"] for item in listed(payment_status="partial")], [order_b])
        self.assertEqual([item["id"] for item in listed(payment_status="paid")], [order_c])
        self.assertEqual({item["id"] for item in listed(has_comment=True)}, {order_a, order_c})
        self.assertEqual([item["id"] for item in listed(has_comment=False)], [order_b])
        self.assertEqual([item["id"] for item in listed(has_documents=True)], [order_a])
        self.assertEqual([item["id"] for item in listed(client="Anna")], [order_b])
        self.assertEqual([item["id"] for item in listed(client="+70000000031")], [order_c])
        self.assertEqual([item["id"] for item in listed(brand="BMW")], [order_a])
        self.assertEqual([item["id"] for item in listed(model="Q7")], [order_c])
        self.assertEqual([item["id"] for item in listed(plate="A111AA00")], [order_b])
        self.assertEqual({item["id"] for item in listed()}, {order_a, order_b, order_c})
        self.assertTrue(all(item["updated_at"] for item in listed()))

    def test_materials_and_finance_lists_use_pagination_and_lightweight_rows(self) -> None:
        headers = self.auth_headers()

        first_material_id = self.create_material(headers, expense_date=date(2026, 5, 13), name="Foam")
        self.create_material(headers, expense_date=date(2026, 5, 13), name="Towel")
        self.create_material(headers, expense_date=date(2026, 5, 14), name="Wax")
        self.create_finance_expense(headers, expense_date=date(2026, 5, 13), amount="300.00")
        self.create_finance_expense(headers, expense_date=date(2026, 5, 13), amount="500.00")
        self.create_finance_expense(headers, expense_date=date(2026, 5, 14), amount="700.00")

        attachment_response = self.client.post(
            f"/api/materials/{first_material_id}/attachments",
            files={"file": ("foam.txt", b"foam attachment", "text/plain")},
            headers=headers,
        )
        self.assertEqual(attachment_response.status_code, 201, attachment_response.text)

        materials_page = self.client.get("/api/materials?date_from=2026-05-13&date_to=2026-05-13&page=1&page_size=2", headers=headers)
        self.assertEqual(materials_page.status_code, 200, materials_page.text)
        self.assertEqual(materials_page.json()["total"], 2)
        self.assertEqual(materials_page.json()["page"], 1)
        self.assertEqual(materials_page.json()["page_size"], 2)
        self.assertTrue(any(item["attachments_count"] == 1 for item in materials_page.json()["items"]))

        materials_summary = self.client.get("/api/materials/summary?date_from=2026-05-13&date_to=2026-05-13", headers=headers)
        self.assertEqual(materials_summary.status_code, 200, materials_summary.text)
        self.assertEqual(materials_summary.json()["total_amount"], "600.00")

        finance_page = self.client.get("/api/finance/expenses?date_from=2026-05-13&date_to=2026-05-13&page=1&page_size=1", headers=headers)
        self.assertEqual(finance_page.status_code, 200, finance_page.text)
        self.assertEqual(finance_page.json()["total"], 2)
        self.assertEqual(finance_page.json()["page"], 1)
        self.assertEqual(finance_page.json()["page_size"], 1)
        self.assertNotIn("category", finance_page.json()["items"][0])

        finance_summary = self.client.get("/api/finance/expenses/summary?date_from=2026-05-13&date_to=2026-05-13", headers=headers)
        self.assertEqual(finance_summary.status_code, 200, finance_summary.text)
        self.assertEqual(finance_summary.json()["total_amount"], "800.00")


if __name__ == "__main__":
    unittest.main()
