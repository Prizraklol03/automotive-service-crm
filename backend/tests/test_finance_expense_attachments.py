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
from app.db.base import Base  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class FinanceExpenseAttachmentTestCase(unittest.TestCase):
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
            session.commit()
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()

    def auth_headers(self, login: str, password: str) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def create_finance_category(self, headers: dict[str, str]) -> int:
        categories = self.client.get("/api/finance/categories", headers=headers)
        self.assertEqual(categories.status_code, 200, categories.text)
        return categories.json()[0]["id"]

    def create_finance_expense(self, headers: dict[str, str]) -> int:
        category_id = self.create_finance_category(headers)
        response = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": "2026-06-24",
                "category_id": category_id,
                "comment": "Fuel",
                "amount": "1500.00",
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_attachment_crud_follows_finance_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-pass")
        employee_headers = self.auth_headers("employee", "employee-pass")
        expense_id = self.create_finance_expense(admin_headers)

        denied_upload = self.client.post(
            f"/api/finance/expenses/{expense_id}/attachments",
            headers=employee_headers,
            files={"file": ("receipt.pdf", b"receipt-bytes", "application/pdf")},
        )
        self.assertEqual(denied_upload.status_code, 403, denied_upload.text)

        uploaded = self.client.post(
            f"/api/finance/expenses/{expense_id}/attachments",
            headers=admin_headers,
            files={"file": ("receipt.pdf", b"receipt-bytes", "application/pdf")},
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        attachment_id = uploaded.json()["id"]
        self.assertEqual(uploaded.json()["file_name"], "receipt.pdf")

        listed = self.client.get(f"/api/finance/expenses/{expense_id}/attachments", headers=employee_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["id"], attachment_id)

        downloaded = self.client.get(
            f"/api/finance/expenses/{expense_id}/attachments/{attachment_id}/file",
            headers=employee_headers,
        )
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.headers["content-type"], "application/pdf")
        self.assertIn("receipt.pdf", downloaded.headers["content-disposition"])

        denied_delete = self.client.delete(
            f"/api/finance/expenses/{expense_id}/attachments/{attachment_id}",
            headers=employee_headers,
        )
        self.assertEqual(denied_delete.status_code, 403, denied_delete.text)

        deleted = self.client.delete(
            f"/api/finance/expenses/{expense_id}/attachments/{attachment_id}",
            headers=admin_headers,
        )
        self.assertEqual(deleted.status_code, 204, deleted.text)

        missing = self.client.get(
            f"/api/finance/expenses/{expense_id}/attachments/{attachment_id}/file",
            headers=employee_headers,
        )
        self.assertEqual(missing.status_code, 404, missing.text)


if __name__ == "__main__":
    unittest.main()
