from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm import models as crm_models  # noqa: E402,F401
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402

ADMIN_PASSWORD = "Admin order search passphrase 2026!"


def test_get_orders_search_supports_cross_field_tokens_phone_and_plate_fragments() -> None:
    harness = create_schema_harness(metadata=Base.metadata)
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(api_router, prefix="/api")

    def override_get_db():
        with harness.SessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    try:
        with harness.SessionLocal() as session:
            user_service = UserService(session)
            roles = {role.code: role for role in user_service.ensure_default_roles()}
            user_service.create_user(
                UserCreate(
                    role_id=roles["admin"].id,
                    full_name="Demo Customer 19",
                    login="order-search-admin",
                    password=ADMIN_PASSWORD,
                )
            )
            session.add(
                CrmOrderStatus(
                    code="new",
                    display_name="Новый",
                    status_group=StatusGroup.NEW.value,
                    color="#6b7280",
                    sort_order=10,
                    is_default=True,
                )
            )
            session.add(
                CrmOrderStatus(
                    code="in_progress",
                    display_name="In progress",
                    status_group=StatusGroup.IN_PROGRESS.value,
                    color="#2563eb",
                    sort_order=20,
                    is_default=False,
                )
            )
            session.commit()

        with TestClient(app) as client:
            login = client.post(
                "/api/auth/login",
                json={"login": "order-search-admin", "password": ADMIN_PASSWORD},
            )
            assert login.status_code == 200, login.text
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            def create_client(full_name: str, phone: str) -> int:
                response = client.post(
                    "/api/clients",
                    json={"full_name": full_name, "phone": phone},
                    headers=headers,
                )
                assert response.status_code == 201, response.text
                return response.json()["id"]

            def create_vehicle(client_id: int, *, plate: str, vin: str, brand: str, model: str) -> int:
                response = client.post(
                    "/api/vehicles",
                    json={
                        "client_id": client_id,
                        "plate_number": plate,
                        "vin": vin,
                        "brand": brand,
                        "model": model,
                        "year": 2024,
                        "mileage": 1000,
                    },
                    headers=headers,
                )
                assert response.status_code == 201, response.text
                return response.json()["id"]

            def create_order(client_id: int, vehicle_id: int, *, status: str = "new") -> int:
                response = client.post(
                    "/api/orders",
                    json={
                        "client_id": client_id,
                        "vehicle_id": vehicle_id,
                        "status": status,
                        "discount_value": "0.00",
                        "discount_type": "fixed",
                        "services": [],
                    },
                    headers=headers,
                )
                assert response.status_code == 201, response.text
                return response.json()["id"]

            target_client_id = create_client("Тестовый Клиент 04", "+70000000038")
            target_vehicle_id = create_vehicle(
                target_client_id,
                plate="T002ST124",
                vin="ZZZ00000000000001",
                brand="Mazda",
                model="CX-5",
            )
            target_order_id = create_order(target_client_id, target_vehicle_id)

            decoy_client_id = create_client("Тестовый Клиент 02", "+70000000039")
            decoy_vehicle_id = create_vehicle(
                decoy_client_id,
                plate="В456СС",
                vin="ZZZ00000000000002",
                brand="Mazda",
                model="3",
            )
            decoy_order_id = create_order(decoy_client_id, decoy_vehicle_id, status="in_progress")

            def list_ids(query: str | None = None, *, status: str | None = None) -> list[int]:
                params = {
                    "archived_scope": "all",
                    "page": 1,
                    "page_size": 50,
                }
                if query is not None:
                    params["search"] = query
                if status is not None:
                    params["status"] = status
                response = client.get(
                    "/api/orders",
                    params=params,
                    headers=headers,
                )
                assert response.status_code == 200, response.text
                return [item["id"] for item in response.json()["items"]]

            def summary_counters(query: str | None = None) -> dict[str, int]:
                params = {"archived_scope": "all"}
                if query is not None:
                    params["search"] = query
                response = client.get("/api/orders/summary", params=params, headers=headers)
                assert response.status_code == 200, response.text
                return response.json()

            expected_all_ids = {target_order_id, decoy_order_id}
            for query in (None, "", "   "):
                assert set(list_ids(query)) == expected_all_ids, query
                counters = summary_counters(query)
                assert counters["total"] == 2, query
                assert counters["active_total"] == 2, query
                assert counters["archived_total"] == 0, query
                assert counters["active_in_progress_total"] == 1, query
                assert counters["active_waiting_total"] == 1, query
            assert list_ids("", status="in_progress") == [decoy_order_id]
            assert list_ids("   ", status="in_progress") == [decoy_order_id]

            for query in (
                "Mazda CX-5",
                "Иван 4821",
                "1234",
                "4821",
                "+7 (000) 000-00-38",
            ):
                assert list_ids(query) == [target_order_id], query

            assert list_ids("Mazda CX-5 отсутствует") == []
            for query in ("T0", "02", "ST", "ST12", "124", "T002ST124", "т-002-sт-124"):
                assert list_ids(query) == [target_order_id], query
            assert list_ids("T") == []
            assert list_ids("Иванов ST12") == [target_order_id]
            assert list_ids("Иванов ZZ") == []
    finally:
        harness.close()
