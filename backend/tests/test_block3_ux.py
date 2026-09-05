from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.config import get_runtime_dir  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm.models.material_attachment import CrmMaterialAttachment  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.analytics_service import get_default_analytics_period  # noqa: E402
from app.crm.services.analytics_v3_service import resolve_analytics_period  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class Block3UxTestCase(unittest.TestCase):
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
            user_service.create_user(
                UserCreate(role_id=roles["employee"].id, full_name="Demo Customer 02", login="employee", password="employee-pass")
            )
            session.commit()
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()

    def auth_headers(self, login: str = "admin", password: str = "admin-pass") -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_working_month_period_helpers_cover_default_custom_and_previous_month(self) -> None:
        working_month_start, working_month_end = get_default_analytics_period(
            date(2026, 5, 13),
            working_month_start_day=25,
        )
        self.assertEqual(working_month_start, date(2026, 4, 25))
        self.assertEqual(working_month_end, date(2026, 5, 24))

        month_start, month_end = get_default_analytics_period(
            date(2026, 5, 13),
            working_month_start_day=1,
        )
        self.assertEqual(month_start, date(2026, 5, 1))
        self.assertEqual(month_end, date(2026, 5, 31))

        with patch("app.crm.services.analytics_v3_service.app_now_naive", return_value=datetime(2026, 5, 13, 12, 0, 0)):
            expectations = [
                ("today", date(2026, 5, 13), date(2026, 5, 13)),
                ("yesterday", date(2026, 5, 12), date(2026, 5, 12)),
                ("7_days", date(2026, 5, 7), date(2026, 5, 13)),
                ("30_days", date(2026, 4, 14), date(2026, 5, 13)),
                ("working_month", date(2026, 4, 25), date(2026, 5, 24)),
                ("previous_working_month", date(2026, 3, 25), date(2026, 4, 24)),
                ("quarter", date(2026, 4, 1), date(2026, 6, 30)),
            ]

            for preset, expected_from, expected_to in expectations:
                resolved_from, resolved_to = resolve_analytics_period(
                    date_from=None,
                    date_to=None,
                    period_preset=preset,
                    working_month_start_day=25,
                )
                self.assertEqual(resolved_from, expected_from, preset)
                self.assertEqual(resolved_to, expected_to, preset)

            custom_from, custom_to = resolve_analytics_period(
                date_from=date(2026, 4, 1),
                date_to=date(2026, 4, 18),
                period_preset="custom",
                working_month_start_day=25,
            )
            self.assertEqual(custom_from, date(2026, 4, 1))
            self.assertEqual(custom_to, date(2026, 4, 18))

    def test_materials_and_finance_list_endpoints_filter_by_date_range(self) -> None:
        headers = self.auth_headers()
        finance_category = self.client.post("/api/finance/categories", json={"name": "Other"}, headers=headers)
        self.assertEqual(finance_category.status_code, 201, finance_category.text)
        finance_category_id = finance_category.json()["id"]

        material_inside = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-05-13",
                "material_name": "Foam",
                "quantity": 1,
                "service_category_id": None,
                "unit_price": "150.00",
            },
            headers=headers,
        )
        self.assertEqual(material_inside.status_code, 201, material_inside.text)

        material_outside = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-04-14",
                "material_name": "Wax",
                "quantity": 1,
                "service_category_id": None,
                "unit_price": "250.00",
            },
            headers=headers,
        )
        self.assertEqual(material_outside.status_code, 201, material_outside.text)

        finance_inside = self.client.post(
            "/api/finance/expenses",
            json={"expense_date": "2026-05-13", "category_id": finance_category_id, "comment": "Inside", "amount": "300.00"},
            headers=headers,
        )
        self.assertEqual(finance_inside.status_code, 201, finance_inside.text)

        finance_outside = self.client.post(
            "/api/finance/expenses",
            json={"expense_date": "2026-04-14", "category_id": finance_category_id, "comment": "Outside", "amount": "500.00"},
            headers=headers,
        )
        self.assertEqual(finance_outside.status_code, 201, finance_outside.text)

        materials = self.client.get("/api/materials?date_from=2026-04-25&date_to=2026-05-24", headers=headers)
        self.assertEqual(materials.status_code, 200, materials.text)
        self.assertEqual(len(materials.json()), 1)
        self.assertEqual(materials.json()[0]["material_name"], "Foam")

        finance = self.client.get("/api/finance/expenses?date_from=2026-04-25&date_to=2026-05-24", headers=headers)
        self.assertEqual(finance.status_code, 200, finance.text)
        self.assertEqual(len(finance.json()), 1)
        self.assertEqual(finance.json()[0]["comment"], "Inside")

    def test_material_attachments_upload_list_download_delete_and_material_cleanup(self) -> None:
        headers = self.auth_headers()
        material = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-05-13",
                "material_name": "Microfiber",
                "quantity": 2,
                "service_category_id": None,
                "unit_price": "120.00",
            },
            headers=headers,
        )
        self.assertEqual(material.status_code, 201, material.text)
        material_id = material.json()["id"]

        upload = self.client.post(
            f"/api/materials/{material_id}/attachments",
            files={"file": ("invoice.txt", BytesIO(b"material attachment"), "text/plain")},
            headers=headers,
        )
        self.assertEqual(upload.status_code, 201, upload.text)
        attachment = upload.json()
        attachment_id = attachment["id"]
        storage_path = attachment["storage_path"]

        listed = self.client.get(f"/api/materials/{material_id}/attachments", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["file_name"], "invoice.txt")

        downloaded = self.client.get(f"/api/materials/{material_id}/attachments/{attachment_id}/file", headers=headers)
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.content, b"material attachment")

        deleted = self.client.delete(f"/api/materials/{material_id}/attachments/{attachment_id}", headers=headers)
        self.assertEqual(deleted.status_code, 204, deleted.text)

        listed_after_delete = self.client.get(f"/api/materials/{material_id}/attachments", headers=headers)
        self.assertEqual(listed_after_delete.status_code, 200, listed_after_delete.text)
        self.assertEqual(listed_after_delete.json(), [])

        cleanup_material = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-05-13",
                "material_name": "Cleaner",
                "quantity": 1,
                "service_category_id": None,
                "unit_price": "90.00",
            },
            headers=headers,
        )
        self.assertEqual(cleanup_material.status_code, 201, cleanup_material.text)
        cleanup_material_id = cleanup_material.json()["id"]

        cleanup_upload = self.client.post(
            f"/api/materials/{cleanup_material_id}/attachments",
            files={"file": ("cleanup.pdf", BytesIO(b"%PDF-1.4 cleanup"), "application/pdf")},
            headers=headers,
        )
        self.assertEqual(cleanup_upload.status_code, 201, cleanup_upload.text)
        cleanup_attachment = cleanup_upload.json()
        cleanup_storage_path = cleanup_attachment["storage_path"]

        delete_material = self.client.delete(f"/api/materials/{cleanup_material_id}", headers=headers)
        self.assertEqual(delete_material.status_code, 204, delete_material.text)

        session = self.SessionLocal()
        try:
            rows = session.execute(
                select(CrmMaterialAttachment).where(CrmMaterialAttachment.material_id == cleanup_material_id)
            ).scalars().all()
        finally:
            session.close()

        self.assertEqual(rows, [])
        self.assertFalse((get_runtime_dir() / cleanup_storage_path).exists())
        self.assertFalse((get_runtime_dir() / storage_path).exists())
