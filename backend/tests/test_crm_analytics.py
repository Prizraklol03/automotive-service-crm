from __future__ import annotations

import sys
import unittest
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.models.vehicle import CrmVehicle  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.analytics_v3_service import get_default_analytics_period  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class CrmAnalyticsTestCase(unittest.TestCase):
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
            self.seed_order_statuses(session)
            roles = {role.code: role for role in user_service.ensure_default_roles()}
            user_service.create_user(
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="admin-pass")
            )
            user_service.create_user(
                UserCreate(role_id=roles["employee"].id, full_name="Demo Customer 02", login="employee", password="employee-pass")
            )
        finally:
            session.close()

    @staticmethod
    def seed_order_statuses(session: Session) -> None:
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
                    code="done",
                    display_name="Готово",
                    status_group=StatusGroup.DONE.value,
                    color="#10b981",
                    sort_order=30,
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
                CrmOrderStatus(
                    code="cancelled",
                    display_name="Отменён",
                    status_group=StatusGroup.CANCELLED.value,
                    color="#ef4444",
                    sort_order=50,
                    is_default=False,
                ),
            ]
        )
        session.commit()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()

    def auth_headers(self, login: str, password: str) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def create_category(self, headers: dict[str, str], name: str) -> int:
        response = self.client.post(
            "/api/service-categories",
            json={"name": name, "sort_order": 0, "is_active": True},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_client(self, headers: dict[str, str], full_name: str, phone: str) -> int:
        response = self.client.post(
            "/api/clients",
            json={"full_name": full_name, "phone": phone, "comment": None},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_vehicle(self, headers: dict[str, str], client_id: int, plate: str) -> int:
        response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": plate,
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Lada",
                "model": "Vesta",
                "year": 2022,
                "mileage": 10000,
                "color": None,
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
        status: str = "new",
        comment: str | None = None,
        discount_value: str = "0.00",
        discount_type: str = "fixed",
        services: list[dict] | None = None,
        materials: list[dict] | None = None,
    ) -> dict:
        response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": status,
                "comment": comment,
                "discount_value": discount_value,
                "discount_type": discount_type,
                "services": services or [],
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def complete_order(self, headers: dict[str, str], order_id: int, completed_at: str) -> dict:
        response = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "closed", "completed_at": completed_at},
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_client_reminder(self, headers: dict[str, str], client_id: int, text: str) -> dict:
        response = self.client.post(
            f"/api/clients/{client_id}/reminders",
            json={"text": text, "due_at": datetime.now(UTC).isoformat(), "repeat_rule": None},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_order_reminder(self, headers: dict[str, str], order_id: int, text: str) -> dict:
        response = self.client.post(
            f"/api/orders/{order_id}/reminders",
            json={"text": text, "due_at": datetime.now(UTC).isoformat(), "repeat_rule": None},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_material(
        self,
        headers: dict[str, str],
        *,
        material_name: str,
        unit_price: str,
        quantity: int,
        expense_date: str,
        service_category_id: int | None = None,
    ) -> dict:
        response = self.client.post(
            "/api/materials",
            json={
                "material_name": material_name,
                "unit_price": unit_price,
                "quantity": quantity,
                "expense_date": expense_date,
                "service_category_id": service_category_id,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_analytics_are_admin_only(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-pass")
        response = self.client.get("/api/analytics/dashboard", headers=employee_headers)
        self.assertEqual(response.status_code, 403, response.text)

    def test_legacy_analytics_endpoints_are_retired(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        overview = self.client.get("/api/analytics/overview", headers=admin_headers)
        categories = self.client.get("/api/analytics/categories", headers=admin_headers)
        category_orders = self.client.get("/api/analytics/categories/1/orders", headers=admin_headers)
        self.assertEqual(overview.status_code, 404, overview.text)
        self.assertEqual(categories.status_code, 404, categories.text)
        self.assertEqual(category_orders.status_code, 404, category_orders.text)

    def test_default_analytics_period_uses_working_month_from_25th_to_24th(self) -> None:
        self.assertEqual(get_default_analytics_period(date(2026, 1, 25)), (date(2026, 1, 25), date(2026, 2, 24)))
        self.assertEqual(get_default_analytics_period(date(2026, 1, 28)), (date(2026, 1, 25), date(2026, 2, 24)))
        self.assertEqual(get_default_analytics_period(date(2026, 2, 8)), (date(2026, 1, 25), date(2026, 2, 24)))
        self.assertEqual(get_default_analytics_period(date(2026, 2, 25)), (date(2026, 2, 25), date(2026, 3, 24)))

    def test_dashboard_without_explicit_dates_uses_default_working_month_and_sums_discounts(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000003")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A777AA00")

        before_period = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            discount_value="100.00",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wash", "category_name_snapshot": "Care", "unit_price": "1000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, before_period["id"], "2026-01-24T10:00:00")

        period_start = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            discount_value="150.00",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wash", "category_name_snapshot": "Care", "unit_price": "1000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, period_start["id"], "2026-01-25T10:00:00")

        period_end = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            discount_value="50.00",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Detail", "category_name_snapshot": "Care", "unit_price": "2000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, period_end["id"], "2026-02-24T10:00:00")

        next_period = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            discount_value="300.00",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Polish", "category_name_snapshot": "Care", "unit_price": "3000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, next_period["id"], "2026-02-25T10:00:00")

        with patch("app.crm.services.analytics_v3_service.app_now_naive", return_value=datetime(2026, 2, 8, 12, 0, 0)):
            dashboard = self.client.get("/api/analytics/dashboard", headers=admin_headers)

        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        payload = dashboard.json()
        self.assertEqual(payload["overview"]["kpis_row_1"][0]["value"], "2")
        self.assertEqual(payload["overview"]["kpis_row_1"][1]["value"], "2800.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][2]["value"], "200.00")
        self.assertEqual(payload["overview"]["kpis_row_2"][0]["value"], "1400.00")

    def test_percent_discount_is_used_in_dashboard_discount_paths(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Anna Petrova", "+70000000004")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A130CC00")

        order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            discount_value="10.00",
            discount_type="percent",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wash", "category_name_snapshot": "Care", "unit_price": "1000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, order["id"], "2026-03-11T10:00:00")

        dashboard = self.client.get("/api/analytics/dashboard?date_from=2026-03-01&date_to=2026-03-31", headers=admin_headers)
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        dashboard_payload = dashboard.json()
        self.assertEqual(dashboard_payload["overview"]["kpis_row_1"][1]["value"], "900.00")
        self.assertEqual(dashboard_payload["overview"]["kpis_row_1"][2]["value"], "100.00")
        self.assertEqual(dashboard_payload["orders"]["rows"][0]["amount_to_pay"], "900.00")

    def test_analytics_dashboard_v3_includes_finances_clients_and_completed_order_metrics(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        wash_category_id = self.create_category(admin_headers, "Wash")
        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000005")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A111CC00")

        order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            discount_value="100.00",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Premium Wash", "category_name_snapshot": "Wash", "unit_price": "1000.00", "quantity": 1, "sort_key": 0}],
            materials=[{"order_service_index": 0, "material_name": "Foam", "unit_price": "200.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, order["id"], "2026-03-20T10:00:00")

        categories = self.client.get("/api/finance/categories", headers=admin_headers)
        self.assertEqual(categories.status_code, 200, categories.text)
        finance_category_id = next(item["id"] for item in categories.json() if item["name"] == "Зарплата")
        finance = self.client.post(
            "/api/finance/expenses",
            json={"expense_date": "2026-03-20", "category_id": finance_category_id, "comment": "Advance", "amount": "500.00"},
            headers=admin_headers,
        )
        self.assertEqual(finance.status_code, 201, finance.text)

        response = self.client.get("/api/analytics/dashboard?date_from=2026-03-01&date_to=2026-03-31", headers=admin_headers)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertEqual(payload["overview"]["kpis_row_1"][0]["value"], "1")
        self.assertEqual(payload["overview"]["kpis_row_1"][1]["value"], "900.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][3]["value"], "0.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][4]["value"], "900.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][5]["value"], "500.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][6]["value"], "400.00")
        self.assertEqual(payload["finances"]["rows"][0]["amount"], "500.00")
        self.assertEqual(payload["orders"]["rows"][0]["amount_to_pay"], "900.00")
        self.assertEqual(payload["clients"]["rows"][0]["amount_to_pay"], "900.00")
        self.assertEqual(payload["services"]["category_rows"][0]["category_name"], "Wash")
        self.assertEqual(payload["supplies"]["rows"], [])
        self.assertEqual(payload["overview"]["top_categories"][0]["category_name"], "Wash")
        self.assertEqual(payload["overview"]["top_clients"][0]["client_name"], "Demo Customer 03")
        self.assertIn("gross_profit", payload["overview"]["top_clients"][0])
        self.assertNotIn("profit", payload["overview"]["top_clients"][0])
        self.assertIn("gross_profit", payload["overview"]["top_services"][0])
        self.assertNotIn("profit", payload["overview"]["top_services"][0])

    def test_analytics_dashboard_v3_does_not_use_order_list_all_path(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000006")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A150CC00")
        order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wash", "category_name_snapshot": "Care", "unit_price": "1000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, order["id"], "2026-03-20T10:00:00")

        with patch("app.crm.repositories.order_repository.OrderRepository.list_all", side_effect=AssertionError("list_all should not be used by analytics dashboard")):
            response = self.client.get("/api/analytics/dashboard?date_from=2026-03-01&date_to=2026-03-31", headers=admin_headers)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["overview"]["kpis_row_1"][0]["value"], "1")
        self.assertEqual(payload["overview"]["kpis_row_1"][1]["value"], "1000.00")

    def test_analytics_dashboard_v3_respects_category_filter_on_order_rows(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        wash_category_id = self.create_category(admin_headers, "Wash")
        polish_category_id = self.create_category(admin_headers, "Polish")
        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000007")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A112CC00")

        mixed = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            services=[
                {"service_catalog_id": None, "service_name_snapshot": "Premium Wash", "category_name_snapshot": "Wash", "unit_price": "1000.00", "quantity": 1, "sort_key": 0},
                {"service_catalog_id": None, "service_name_snapshot": "Body Polish", "category_name_snapshot": "Polish", "unit_price": "500.00", "quantity": 1, "sort_key": 1},
            ],
            materials=[
                {"order_service_index": 0, "material_name": "Foam", "unit_price": "200.00", "quantity": 1, "sort_key": 0},
                {"order_service_index": 1, "material_name": "Paste", "unit_price": "100.00", "quantity": 1, "sort_key": 1},
            ],
        )
        self.complete_order(employee_headers, mixed["id"], "2026-03-22T10:00:00")

        response = self.client.get(
            f"/api/analytics/dashboard?date_from=2026-03-01&date_to=2026-03-31&category_ids={wash_category_id}",
            headers=admin_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["overview"]["kpis_row_1"][1]["value"], "1000.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][3]["value"], "0.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][4]["value"], "1000.00")
        self.assertEqual(payload["services"]["category_rows"][0]["category_name"], "Wash")
        self.assertIn("gross_profit", payload["services"]["category_rows"][0]["top_services"][0])
        self.assertNotIn("profit", payload["services"]["category_rows"][0]["top_services"][0])

    def test_analytics_drilldown_v3_returns_finance_and_new_client_lists(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 11", "+70000000008")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A113CC00")
        order = self.create_order(employee_headers, client_id=client_id, vehicle_id=vehicle_id)
        self.complete_order(employee_headers, order["id"], "2026-03-23T10:00:00")

        categories = self.client.get("/api/finance/categories", headers=admin_headers)
        finance_category_id = next(item["id"] for item in categories.json() if item["name"] == "Прочее")
        finance = self.client.post(
            "/api/finance/expenses",
            json={"expense_date": "2026-03-23", "category_id": finance_category_id, "comment": "Stationery", "amount": "300.00"},
            headers=admin_headers,
        )
        self.assertEqual(finance.status_code, 201, finance.text)

        finance_drilldown = self.client.get(
            "/api/analytics/drilldown?metric=finance_expenses&date_from=2026-03-01&date_to=2026-03-31",
            headers=admin_headers,
        )
        self.assertEqual(finance_drilldown.status_code, 200, finance_drilldown.text)
        self.assertEqual(finance_drilldown.json()["rows"][0]["amount"], "300.00")

        new_clients_drilldown = self.client.get(
            "/api/analytics/drilldown?metric=new_clients&date_from=2026-03-01&date_to=2026-03-31",
            headers=admin_headers,
        )
        self.assertEqual(new_clients_drilldown.status_code, 200, new_clients_drilldown.text)
        self.assertEqual(new_clients_drilldown.json()["rows"][0]["entity_id"], client_id)

    def test_analytics_dashboard_v3_counts_materials_journal_in_supplies_and_profit(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        category_id = self.create_category(admin_headers, "Paint")
        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000009")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A114CC00")
        order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            services=[{"service_catalog_id": None, "service_name_snapshot": "Paint work", "category_name_snapshot": "Paint", "unit_price": "10000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, order["id"], "2026-03-27T10:00:00")
        self.create_material(
            admin_headers,
            material_name="Primer",
            unit_price="1500.00",
            quantity=2,
            expense_date="2026-03-27",
            service_category_id=category_id,
        )

        response = self.client.get("/api/analytics/dashboard?date_from=2026-03-25&date_to=2026-04-24", headers=admin_headers)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertEqual(payload["overview"]["kpis_row_1"][1]["value"], "10000.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][3]["value"], "3000.00")
        self.assertEqual(payload["overview"]["kpis_row_1"][4]["value"], "7000.00")
        self.assertEqual(payload["supplies"]["rows"][0]["material_name"], "Primer")
        self.assertIsNone(payload["supplies"]["rows"][0]["order_id"])

    def test_analytics_unpaid_counts_only_new_and_in_progress(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000010")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A115CC00")

        self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="new",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wait", "category_name_snapshot": "Care", "unit_price": "1000.00", "quantity": 1, "sort_key": 0}],
        )
        self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="in_progress",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Work", "category_name_snapshot": "Care", "unit_price": "2000.00", "quantity": 1, "sort_key": 0}],
        )
        self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="in_progress",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Later", "category_name_snapshot": "Care", "unit_price": "3000.00", "quantity": 1, "sort_key": 0}],
        )
        self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="new",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Draft", "category_name_snapshot": "Care", "unit_price": "4000.00", "quantity": 1, "sort_key": 0}],
        )
        cancelled = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="cancelled",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Cancelled", "category_name_snapshot": "Care", "unit_price": "5000.00", "quantity": 1, "sort_key": 0}],
        )
        completed = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="new",
            services=[{"service_catalog_id": None, "service_name_snapshot": "Completed", "category_name_snapshot": "Care", "unit_price": "6000.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, completed["id"], "2026-03-28T10:00:00")

        response = self.client.get("/api/analytics/dashboard?date_from=2026-03-25&date_to=2026-04-24", headers=admin_headers)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertEqual(payload["overview"]["kpis_row_2"][4]["value"], "10000.00")
        self.assertEqual(payload["orders"]["kpis"][4]["value"], "4")

        drilldown = self.client.get("/api/analytics/drilldown?metric=unpaid&date_from=2026-03-25&date_to=2026-04-24", headers=admin_headers)
        self.assertEqual(drilldown.status_code, 200, drilldown.text)
        self.assertEqual(len(drilldown.json()["rows"]), 4)

    def test_analytics_unpaid_includes_waiting_orders_created_before_period(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 11", "+70000000011")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A116CC00")

        old_waiting = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            status="new",
            services=[
                {
                    "service_catalog_id": None,
                    "service_name_snapshot": "Diagnostics",
                    "category_name_snapshot": "Care",
                    "unit_price": "14000.00",
                    "quantity": 1,
                    "sort_key": 0,
                }
            ],
        )

        dashboard = self.client.get(
            "/api/analytics/dashboard?date_from=2026-03-25&date_to=2026-04-24",
            headers=admin_headers,
        )
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        payload = dashboard.json()
        self.assertEqual(payload["overview"]["kpis_row_2"][4]["value"], "14000.00")
        self.assertEqual(payload["orders"]["kpis"][4]["value"], "1")

        drilldown = self.client.get(
            "/api/analytics/drilldown?metric=unpaid&date_from=2026-03-25&date_to=2026-04-24",
            headers=admin_headers,
        )
        self.assertEqual(drilldown.status_code, 200, drilldown.text)
        self.assertEqual(len(drilldown.json()["rows"]), 1)
        self.assertEqual(drilldown.json()["rows"][0]["order_id"], old_waiting["id"])

    def test_client_summary_orders_services_and_active_reminders(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 03", "+70000000012")
        first_vehicle_id = self.create_vehicle(employee_headers, client_id, "A555AA00")
        second_vehicle_id = self.create_vehicle(employee_headers, client_id, "A556AA00")

        first_order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=first_vehicle_id,
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wash", "category_name_snapshot": "Care", "unit_price": "1000.00", "quantity": 2, "sort_key": 0}],
            materials=[{"order_service_index": 0, "material_name": "Soap", "unit_price": "100.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, first_order["id"], "2026-03-10T10:00:00")

        second_order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=second_vehicle_id,
            services=[{"service_catalog_id": None, "service_name_snapshot": "Wash", "category_name_snapshot": "Care", "unit_price": "1200.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, second_order["id"], "2026-03-20T10:00:00")

        self.create_order(employee_headers, client_id=client_id, vehicle_id=first_vehicle_id, status="new")
        self.create_client_reminder(employee_headers, client_id, "Call about revisit")

        summary = self.client.get(f"/api/clients/{client_id}/summary", headers=employee_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        payload = summary.json()
        self.assertEqual(payload["total_orders"], 3)
        self.assertEqual(payload["completed_orders_count"], 2)
        self.assertEqual(payload["total_turnover"], "3200.00")
        self.assertEqual(payload["total_profit"], "0.00")
        self.assertEqual(payload["average_check"], "1600.00")
        self.assertEqual(payload["last_visit"], "2026-03-20T10:00:00")
        self.assertEqual(payload["most_frequent_services"][0]["service_name"], "Wash")
        self.assertEqual(len(payload["active_reminders"]), 1)

    def test_vehicle_summary_services_and_active_order_reminders(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-pass")

        client_id = self.create_client(employee_headers, "Demo Customer 11", "+70000000013")
        vehicle_id = self.create_vehicle(employee_headers, client_id, "A666AA00")
        other_vehicle_id = self.create_vehicle(employee_headers, client_id, "A667AA00")

        tracked_order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=vehicle_id,
            services=[{"service_catalog_id": None, "service_name_snapshot": "Detail", "category_name_snapshot": "Care", "unit_price": "2000.00", "quantity": 1, "sort_key": 0}],
            materials=[{"order_service_index": 0, "material_name": "Wax", "unit_price": "400.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, tracked_order["id"], "2026-03-18T10:00:00")

        other_order = self.create_order(
            employee_headers,
            client_id=client_id,
            vehicle_id=other_vehicle_id,
            services=[{"service_catalog_id": None, "service_name_snapshot": "Other", "category_name_snapshot": "Care", "unit_price": "1500.00", "quantity": 1, "sort_key": 0}],
        )
        self.complete_order(employee_headers, other_order["id"], "2026-03-19T10:00:00")

        self.create_order_reminder(employee_headers, tracked_order["id"], "Return vehicle")

        summary = self.client.get(f"/api/vehicles/{vehicle_id}/summary", headers=employee_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        payload = summary.json()
        self.assertEqual(payload["total_orders"], 1)
        self.assertEqual(payload["completed_orders_count"], 1)
        self.assertEqual(payload["total_turnover"], "2000.00")
        self.assertEqual(payload["total_profit"], "0.00")
        self.assertEqual(payload["last_visit"], "2026-03-18T10:00:00")
        self.assertEqual(payload["most_frequent_services"][0]["service_name"], "Detail")
        self.assertEqual(len(payload["active_reminders"]), 1)

    def test_vehicle_summary_uses_owner_history_when_vehicle_mirror_diverges(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-pass")

        first_client_id = self.create_client(employee_headers, "Demo Customer 11", "+70000000014")
        second_client_id = self.create_client(employee_headers, "Anna Petrova", "+70000000015")
        vehicle_id = self.create_vehicle(employee_headers, first_client_id, "A668AA00")

        reassigned = self.client.post(
            f"/api/vehicles/{vehicle_id}/owners",
            json={"client_id": second_client_id},
            headers=employee_headers,
        )
        self.assertEqual(reassigned.status_code, 200, reassigned.text)

        session = self.SessionLocal()
        try:
            vehicle = session.get(CrmVehicle, vehicle_id)
            self.assertIsNotNone(vehicle)
            vehicle.client_id = first_client_id
            session.commit()
        finally:
            session.close()

        summary = self.client.get(f"/api/vehicles/{vehicle_id}/summary", headers=employee_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["client_id"], second_client_id)


if __name__ == "__main__":
    unittest.main()

