from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm.models.car_brand import CrmCarBrand  # noqa: E402
from app.crm.models.car_model import CrmCarModel  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class OrderStatusHistoryApiTestCase(unittest.TestCase):
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
            user_service.create_user(
                UserCreate(role_id=roles["employee"].id, full_name="Demo Customer 02", login="employee", password="employee-pass")
            )

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

    def auth_headers(self) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": "employee", "password": "employee-pass"})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def test_order_detail_contains_status_history(self) -> None:
        headers = self.auth_headers()
        client_response = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 20", "phone": "+70000000020", "comment": None},
            headers=headers,
        )
        self.assertEqual(client_response.status_code, 201, client_response.text)

        vehicle_response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_response.json()["id"],
                "plate_number": "A111AA00",
                "vin": None,
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
                        "service_name_snapshot": "Мойка",
                        "category_name_snapshot": "Услуги",
                        "unit_price": "1000.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        order_id = order_response.json()["id"]

        status_response = self.client.patch(f"/api/orders/{order_id}/status", json={"status": "in_progress"}, headers=headers)
        self.assertEqual(status_response.status_code, 200, status_response.text)

        detail_response = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail_response.status_code, 200, detail_response.text)
        self.assertEqual([item["status"] for item in detail_response.json()["status_history"]], ["new", "in_progress"])


if __name__ == "__main__":
    unittest.main()
