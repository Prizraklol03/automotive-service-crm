from __future__ import annotations

import sys
import unittest
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
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm.models import CrmCarBrand, CrmCarModel, CrmOrder, CrmOrderStatus, CrmVehicleOwnerHistory  # noqa: E402
from app.crm.models.order_status import StatusGroup  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class ClientVehicleHistoryApiTestCase(unittest.TestCase):
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
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="admin-pass")
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
                        code="done",
                        display_name="Готово",
                        status_group=StatusGroup.DONE.value,
                        color="#10b981",
                        sort_order=20,
                        is_default=False,
                    ),
                    CrmOrderStatus(
                        code="closed",
                        display_name="Выдан",
                        status_group=StatusGroup.CLOSED.value,
                        color="#0f766e",
                        sort_order=30,
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
        response = self.client.post("/api/auth/login", json={"login": "admin", "password": "admin-pass"})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def create_brand_model(self, session: Session) -> tuple[int, int]:
        brand = session.scalar(select(CrmCarBrand).where(CrmCarBrand.name == "Lada"))
        if brand is None:
            brand = CrmCarBrand(name="Lada", normalized_name="lada", sort_order=0, is_active=True)
            session.add(brand)
            session.flush()

        model = session.scalar(select(CrmCarModel).where(CrmCarModel.brand_id == brand.id, CrmCarModel.name == "Vesta"))
        if model is None:
            model = CrmCarModel(brand_id=brand.id, name="Vesta", normalized_name="vesta", sort_order=0, is_active=True)
            session.add(model)
            session.flush()

        return brand.id, model.id

    def create_client(self, headers: dict[str, str], full_name: str, phone: str) -> int:
        response = self.client.post(
            "/api/clients",
            json={"full_name": full_name, "phone": phone, "telegram_username": None, "comment": None},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_vehicle(self, headers: dict[str, str], client_id: int, plate_number: str) -> int:
        session = self.SessionLocal()
        try:
            brand_id, model_id = self.create_brand_model(session)
            session.commit()
        finally:
            session.close()

        response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": plate_number,
                "vin": None,
                "brand_id": brand_id,
                "model_id": model_id,
                "brand": None,
                "model": None,
                "year": 2022,
                "mileage": 10000,
                "color": "Black",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_order(self, headers: dict[str, str], client_id: int, vehicle_id: int, amount: str, comment: str) -> int:
        response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": comment,
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Wash",
                        "category_name_snapshot": "Wash",
                        "unit_price": amount,
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_detail_endpoints_show_history_and_owner_changes(self) -> None:
        headers = self.auth_headers()
        first_client_id = self.create_client(headers, "Demo Customer 03", "+70000000001")
        second_client_id = self.create_client(headers, "Demo Customer 11", "+70000000002")
        vehicle_id = self.create_vehicle(headers, first_client_id, "A777AA00")

        first_order_id = self.create_order(headers, first_client_id, vehicle_id, "1500.00", "Old owner order")

        update_response = self.client.put(
            f"/api/vehicles/{vehicle_id}",
            json={
                "client_id": second_client_id,
                "plate_number": "A777AA00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Lada",
                "model": "Vesta",
                "year": 2022,
                "mileage": 10000,
                "color": "Black",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)

        second_order_id = self.create_order(headers, second_client_id, vehicle_id, "2000.00", "New owner order")

        session = self.SessionLocal()
        try:
            order_updated_at = {
                order.id: order.updated_at.isoformat()
                for order in session.scalars(select(CrmOrder).where(CrmOrder.id.in_([first_order_id, second_order_id])))
            }
        finally:
            session.close()

        client_detail = self.client.get(f"/api/clients/{first_client_id}", headers=headers)
        self.assertEqual(client_detail.status_code, 200, client_detail.text)
        client_orders = client_detail.json()["orders"]
        self.assertEqual([item["id"] for item in client_orders], [first_order_id])
        self.assertEqual(client_orders[0]["vehicle_plate_number"], "A777AA00")
        self.assertEqual(client_orders[0]["updated_at"], order_updated_at[first_order_id])

        client_orders_response = self.client.get(f"/api/clients/{first_client_id}/orders", headers=headers)
        self.assertEqual(client_orders_response.status_code, 200, client_orders_response.text)
        self.assertEqual(client_orders_response.json()["orders"][0]["updated_at"], order_updated_at[first_order_id])

        vehicle_detail = self.client.get(f"/api/vehicles/{vehicle_id}", headers=headers)
        self.assertEqual(vehicle_detail.status_code, 200, vehicle_detail.text)
        vehicle_payload = vehicle_detail.json()
        self.assertEqual(vehicle_payload["current_owner_full_name"], "Demo Customer 11")
        self.assertEqual([item["id"] for item in vehicle_payload["orders"]], [second_order_id, first_order_id])
        self.assertEqual(
            {item["id"]: item["updated_at"] for item in vehicle_payload["orders"]},
            order_updated_at,
        )
        self.assertEqual(vehicle_payload["owner_history"][0]["status"], "current")
        self.assertIn("Новый владелец", " ".join(item["title"] for item in vehicle_payload["owner_history"]))
        self.assertEqual(vehicle_payload["owner_history"][1]["status"], "former")

        vehicle_orders_response = self.client.get(f"/api/vehicles/{vehicle_id}/orders", headers=headers)
        self.assertEqual(vehicle_orders_response.status_code, 200, vehicle_orders_response.text)
        self.assertEqual(
            {item["id"]: item["updated_at"] for item in vehicle_orders_response.json()["orders"]},
            order_updated_at,
        )

        self.assertEqual(self.client.get("/api/clients/999999", headers=headers).status_code, 404)
        self.assertEqual(self.client.get("/api/vehicles/999999", headers=headers).status_code, 404)

        session = self.SessionLocal()
        try:
            open_owner_rows = session.scalar(
                select(func.count()).select_from(CrmVehicleOwnerHistory).where(
                    CrmVehicleOwnerHistory.vehicle_id == vehicle_id,
                    CrmVehicleOwnerHistory.owned_to.is_(None),
                )
            )
        finally:
            session.close()

        self.assertEqual(open_owner_rows, 1)


if __name__ == "__main__":
    unittest.main()
