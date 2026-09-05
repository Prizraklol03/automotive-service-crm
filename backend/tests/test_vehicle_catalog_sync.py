from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime
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
from app.crm.models.car_brand import CrmCarBrand  # noqa: E402
from app.crm.models.car_model import CrmCarModel  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.crm.services.vehicle_catalog_sync_service import (  # noqa: E402
    VehicleCatalogBrandRecord,
    VehicleCatalogModelRecord,
    VehicleCatalogProvider,
    VehicleCatalogSyncService,
)
from app.crm.services.vehicle_service import VehicleService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class FakeVehicleCatalogProvider(VehicleCatalogProvider):
    provider_name = "fake_vehicle_catalog"

    def __init__(self, brands: list[VehicleCatalogBrandRecord]) -> None:
        self.brands = brands

    def fetch_catalog(self) -> list[VehicleCatalogBrandRecord]:
        return self.brands


class VehicleCatalogSyncTestCase(unittest.TestCase):
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
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="admin-pass")
            )
            user_service.create_user(
                UserCreate(role_id=roles["employee"].id, full_name="Demo Customer 02", login="employee", password="employee-pass")
            )
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()

    def auth_headers(self, login: str, password: str) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def build_provider_snapshot(self) -> FakeVehicleCatalogProvider:
        return FakeVehicleCatalogProvider(
            [
                VehicleCatalogBrandRecord(
                    source_brand_id="448",
                    name="Toyota",
                    models=[
                        VehicleCatalogModelRecord(source_model_id="1908", name="Camry"),
                        VehicleCatalogModelRecord(source_model_id="1907", name="Corolla"),
                    ],
                ),
                VehicleCatalogBrandRecord(
                    source_brand_id="452",
                    name="BMW",
                    models=[VehicleCatalogModelRecord(source_model_id="2020", name="X5")],
                ),
            ]
        )

    def test_initial_import_populates_api_and_vehicle_flow(self) -> None:
        session = self.SessionLocal()
        try:
            result = VehicleCatalogSyncService(session, provider=self.build_provider_snapshot()).sync(
                now=datetime(2026, 3, 1, tzinfo=UTC)
            )
            self.assertEqual(result.brands_added, 2)
            self.assertEqual(result.models_added, 3)
        finally:
            session.close()

        headers = self.auth_headers("employee", "employee-pass")
        brands = self.client.get("/api/car-brands", headers=headers)
        self.assertEqual(brands.status_code, 200, brands.text)
        self.assertEqual(len(brands.json()), 2)

        toyota = next(item for item in brands.json() if item["name"] == "Toyota")
        models = self.client.get(f"/api/car-models/by-brand/{toyota['id']}", headers=headers)
        self.assertEqual(models.status_code, 200, models.text)
        self.assertEqual({item["name"] for item in models.json()}, {"Camry", "Corolla"})

        client_created = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 24", "phone": "+70000000025", "comment": None},
            headers=headers,
        )
        self.assertEqual(client_created.status_code, 201, client_created.text)
        client_id = client_created.json()["id"]

        vehicle_created = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": "A111AA00",
                "vin": None,
                "brand_id": toyota["id"],
                "model_id": models.json()[0]["id"],
                "brand": None,
                "model": None,
                "year": 2024,
                "mileage": 1000,
                "color": "Black",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(vehicle_created.status_code, 201, vehicle_created.text)
        self.assertEqual(vehicle_created.json()["brand"], "Toyota")

    def test_repeated_sync_is_idempotent(self) -> None:
        session = self.SessionLocal()
        try:
            service = VehicleCatalogSyncService(session, provider=self.build_provider_snapshot())
            first = service.sync(now=datetime(2026, 3, 1, tzinfo=UTC))
            second = service.sync(now=datetime(2026, 3, 2, tzinfo=UTC))

            self.assertEqual(first.brands_added, 2)
            self.assertEqual(first.models_added, 3)
            self.assertEqual(second.mode, "merge")
            self.assertEqual(second.brands_added, 0)
            self.assertEqual(second.models_added, 0)
            self.assertEqual(second.brands_skipped, 2)
            self.assertEqual(second.models_skipped, 3)

            brand_count = session.scalar(select(func.count()).select_from(CrmCarBrand))
            model_count = session.scalar(select(func.count()).select_from(CrmCarModel))
            self.assertEqual(brand_count, 2)
            self.assertEqual(model_count, 3)
        finally:
            session.close()

    def test_monthly_sync_adds_new_rows_and_manual_vehicle_fallback_stays_available(self) -> None:
        session = self.SessionLocal()
        try:
            initial_provider = FakeVehicleCatalogProvider(
                [
                    VehicleCatalogBrandRecord(
                        source_brand_id="448",
                        name="Toyota",
                        models=[VehicleCatalogModelRecord(source_model_id="1908", name="Camry")],
                    )
                ]
            )
            follow_up_provider = FakeVehicleCatalogProvider(
                [
                    VehicleCatalogBrandRecord(
                        source_brand_id="448",
                        name="Toyota",
                        models=[
                            VehicleCatalogModelRecord(source_model_id="1908", name="Camry"),
                            VehicleCatalogModelRecord(source_model_id="1999", name="Land Cruiser Prado"),
                        ],
                    ),
                    VehicleCatalogBrandRecord(
                        source_brand_id="449",
                        name="Mercedes-Benz",
                        models=[VehicleCatalogModelRecord(source_model_id="3001", name="GLE")],
                    ),
                ]
            )

            VehicleCatalogSyncService(session, provider=initial_provider).sync(now=datetime(2026, 3, 1, tzinfo=UTC))
            skipped = VehicleCatalogSyncService(session, provider=follow_up_provider).sync_if_due(
                now=datetime(2026, 3, 15, tzinfo=UTC)
            )
            self.assertIsNone(skipped)

            result = VehicleCatalogSyncService(session, provider=follow_up_provider).sync_if_due(
                now=datetime(2026, 4, 5, tzinfo=UTC)
            )
            self.assertIsNotNone(result)
            assert result is not None
            self.assertEqual(result.brands_added, 1)
            self.assertEqual(result.models_added, 2)
            self.assertEqual(result.brands_skipped, 1)
            self.assertEqual(result.models_skipped, 1)

            if session.scalar(select(func.count()).select_from(CrmCarBrand)) < 2:
                self.fail("Vehicle catalog sync did not add expected brands")

            client_response = self.client.post(
                "/api/clients",
                json={"full_name": "Demo Customer 25", "phone": "+70000000026", "comment": None},
                headers=self.auth_headers("employee", "employee-pass"),
            )
            self.assertEqual(client_response.status_code, 201, client_response.text)
            client_id = client_response.json()["id"]

            manual_vehicle = VehicleService(session).create(
                payload=type(
                    "VehiclePayload",
                    (),
                    {
                        "client_id": client_id,
                        "plate_number": "B222BB00",
                        "vin": None,
                        "brand_id": None,
                        "model_id": None,
                        "brand": "Zeekr",
                        "model": "001",
                        "year": 2025,
                        "mileage": 0,
                        "color": "White",
                        "comment": None,
                    },
                )()
            )
            self.assertEqual(manual_vehicle.brand, "Zeekr")
            self.assertEqual(manual_vehicle.model, "001")
        finally:
            session.close()

    def test_replace_mode_is_explicit_and_dry_run_keeps_existing_catalog(self) -> None:
        session = self.SessionLocal()
        try:
            VehicleCatalogSyncService(session, provider=self.build_provider_snapshot()).sync(now=datetime(2026, 3, 1, tzinfo=UTC))
            replace_provider = FakeVehicleCatalogProvider(
                [
                    VehicleCatalogBrandRecord(
                        source_brand_id="777",
                        name="Audi",
                        models=[VehicleCatalogModelRecord(source_model_id="777:a6", name="A6")],
                    )
                ]
            )

            preview = VehicleCatalogSyncService(session, provider=replace_provider).sync(
                now=datetime(2026, 3, 2, tzinfo=UTC),
                replace=True,
                dry_run=True,
            )
            self.assertTrue(preview.dry_run)
            self.assertEqual(preview.mode, "replace")
            self.assertEqual(preview.brands_deleted, 2)
            self.assertEqual(preview.models_deleted, 3)

            brand_count_after_dry_run = session.scalar(select(func.count()).select_from(CrmCarBrand))
            model_count_after_dry_run = session.scalar(select(func.count()).select_from(CrmCarModel))
            self.assertEqual(brand_count_after_dry_run, 2)
            self.assertEqual(model_count_after_dry_run, 3)
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main()
