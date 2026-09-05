from __future__ import annotations

import sys
import unittest
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
from app.crm.models.audit_log import CrmAuditLog  # noqa: E402
from app.crm.models.user import CrmUser  # noqa: E402
from app.crm.models.user_permission import CrmUserPermission  # noqa: E402
from app.crm.models.user_session import CrmUserSession  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class UserArchivingApiTestCase(unittest.TestCase):
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
            users = UserService(session)
            roles = {role.code: role for role in users.ensure_default_roles()}
            users.create_user(UserCreate(role_id=roles["admin"].id, full_name="Admin", login="admin", password="Admin test passphrase 2026!"))
            users.create_user(UserCreate(role_id=roles["standard_user"].id, full_name="User", login="user", password="User test passphrase 2026!"))
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()

    def login(self, login: str, password: str, *, device_name: str = "Test device") -> dict:
        response = self.client.post(
            "/api/auth/login",
            json={"login": login, "password": password, "device_type": "mobile", "device_name": device_name},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def headers(self, login: str, password: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.login(login, password)['access_token']}"}

    def user_id(self, login: str) -> int:
        session = self.SessionLocal()
        try:
            user_id = session.scalar(select(CrmUser.id).where(CrmUser.login == login))
            assert user_id is not None
            return user_id
        finally:
            session.close()

    def test_archive_revokes_credentials_and_preserves_user_permissions_and_activity(self) -> None:
        admin_headers = self.headers("admin", "Admin test passphrase 2026!")
        first_session = self.login("user", "User test passphrase 2026!", device_name="Phone")
        second_session = self.login("user", "User test passphrase 2026!", device_name="Tablet")
        user_id = self.user_id("user")

        permissions = self.client.patch(
            f"/api/users/{user_id}/permissions",
            json={"permissions": [{"permission_code": "analytics.view", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(permissions.status_code, 200, permissions.text)

        archived = self.client.patch(f"/api/users/{user_id}/active", json={"is_active": False}, headers=admin_headers)
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertFalse(archived.json()["is_active"])

        session = self.SessionLocal()
        try:
            user = session.get(CrmUser, user_id)
            self.assertIsNotNone(user)
            assert user is not None
            self.assertFalse(user.is_active)
            self.assertGreaterEqual(user.token_version, 2)
            self.assertTrue(session.scalars(select(CrmUserPermission).where(CrmUserPermission.user_id == user_id)).all())
            session_rows = session.scalars(select(CrmUserSession).where(CrmUserSession.user_id == user_id)).all()
            self.assertEqual(len(session_rows), 2)
            self.assertTrue(all(row.revoked_at is not None for row in session_rows))
            self.assertTrue(
                session.scalar(
                    select(CrmAuditLog).where(
                        CrmAuditLog.entity_type == "user",
                        CrmAuditLog.entity_id == user_id,
                        CrmAuditLog.action == "archive",
                    )
                )
            )
        finally:
            session.close()

        access = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {first_session['access_token']}"})
        self.assertEqual(access.status_code, 401, access.text)
        for tokens in (first_session, second_session):
            refresh = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
            self.assertEqual(refresh.status_code, 401, refresh.text)
        login = self.client.post("/api/auth/login", json={"login": "user", "password": "User test passphrase 2026!"})
        self.assertEqual(login.status_code, 401, login.text)

        activity = self.client.get(f"/api/users/{user_id}/activity", headers=admin_headers)
        self.assertEqual(activity.status_code, 200, activity.text)
        self.assertTrue(activity.json()["activities"])

    def test_restore_requires_new_login_and_keeps_old_sessions_invalid(self) -> None:
        admin_headers = self.headers("admin", "Admin test passphrase 2026!")
        tokens = self.login("user", "User test passphrase 2026!")
        user_id = self.user_id("user")

        self.assertEqual(
            self.client.patch(f"/api/users/{user_id}/active", json={"is_active": False}, headers=admin_headers).status_code,
            200,
        )
        restored = self.client.patch(f"/api/users/{user_id}/active", json={"is_active": True}, headers=admin_headers)
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertTrue(restored.json()["is_active"])

        old_access = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
        self.assertEqual(old_access.status_code, 401, old_access.text)
        old_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(old_refresh.status_code, 401, old_refresh.text)
        self.assertEqual(self.client.post("/api/auth/login", json={"login": "user", "password": "User test passphrase 2026!"}).status_code, 200)

    def test_self_archive_and_last_active_admin_archive_are_forbidden(self) -> None:
        admin_headers = self.headers("admin", "Admin test passphrase 2026!")
        admin_id = self.user_id("admin")

        self_archive = self.client.patch(f"/api/users/{admin_id}/active", json={"is_active": False}, headers=admin_headers)
        self.assertEqual(self_archive.status_code, 403, self_archive.text)

        user_id = self.user_id("user")
        permission = self.client.patch(
            f"/api/users/{user_id}/permissions",
            json={"permissions": [{"permission_code": "settings.users.manage", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(permission.status_code, 200, permission.text)
        user_headers = self.headers("user", "User test passphrase 2026!")
        last_admin = self.client.patch(f"/api/users/{admin_id}/active", json={"is_active": False}, headers=user_headers)
        self.assertEqual(last_admin.status_code, 409, last_admin.text)

        second_admin = self.client.post(
            "/api/users",
            json={"role_code": "admin", "full_name": "Demo Customer 23", "login": "other-admin", "password": "other-admin-pass"},
            headers=admin_headers,
        )
        self.assertEqual(second_admin.status_code, 201, second_admin.text)
        second_admin_id = second_admin.json()["id"]
        allowed = self.client.patch(f"/api/users/{second_admin_id}/active", json={"is_active": False}, headers=admin_headers)
        self.assertEqual(allowed.status_code, 200, allowed.text)

    def test_list_filters_active_and_archived_users(self) -> None:
        admin_headers = self.headers("admin", "Admin test passphrase 2026!")
        user_id = self.user_id("user")
        self.assertEqual(
            self.client.patch(f"/api/users/{user_id}/active", json={"is_active": False}, headers=admin_headers).status_code,
            200,
        )

        active = self.client.get("/api/users?is_active=true", headers=admin_headers)
        archived = self.client.get("/api/users?is_active=false", headers=admin_headers)
        self.assertEqual(active.status_code, 200, active.text)
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertNotIn(user_id, {item["id"] for item in active.json()})
        self.assertIn(user_id, {item["id"] for item in archived.json()})


if __name__ == "__main__":
    unittest.main()
