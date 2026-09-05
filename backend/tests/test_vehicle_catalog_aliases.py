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
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class VehicleCatalogAliasesApiTestCase(unittest.TestCase):
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

            brand = CrmCarBrand(
                name="Acura",
                normalized_name="acura",
                source_name="local_bundle",
                source_brand_id="acura",
                sort_order=1,
                is_active=True,
            )
            session.add(brand)
            session.flush()

            session.add(
                CrmCarModel(
                    brand_id=brand.id,
                    name="Integra",
                    normalized_name="integra",
                    source_name="local_bundle",
                    source_model_id="acura:integra",
                    sort_order=1,
                    is_active=True,
                )
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

    def test_reference_catalog_returns_aliases_from_local_bundle(self) -> None:
        headers = self.auth_headers()

        brands_response = self.client.get("/api/car-brands", headers=headers)
        self.assertEqual(brands_response.status_code, 200, brands_response.text)
        brand = brands_response.json()[0]
        self.assertIn("Acura", brand["aliases"])
        self.assertIn("Акура", brand["aliases"])

        models_response = self.client.get(f"/api/car-models/by-brand/{brand['id']}", headers=headers)
        self.assertEqual(models_response.status_code, 200, models_response.text)
        model = models_response.json()[0]
        self.assertIn("Integra", model["aliases"])
        self.assertIn("Интегра", model["aliases"])


if __name__ == "__main__":
    unittest.main()
