from __future__ import annotations

import sys
import unittest
from datetime import timedelta
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
from app.crm.models.user import CrmUser  # noqa: E402
from app.crm.models.user_session import CrmUserSession  # noqa: E402
from app.crm.repositories.user_session_repository import UserSessionRepository  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.auth_service import reset_auth_rate_limiters  # noqa: E402
from app.crm.services.session_housekeeping_service import SessionHousekeepingService  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class AuthSessionApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        reset_auth_rate_limiters()
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
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="Admin test passphrase 2026!")
            )
            user_service.create_user(
                UserCreate(role_id=roles["standard_user"].id, full_name="Demo Customer 02", login="employee", password="Employee test passphrase 2026!")
            )
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()
        reset_auth_rate_limiters()

    def login(self, login: str, password: str, **extra_payload) -> dict:
        payload = {"login": login, "password": password}
        payload.update(extra_payload)
        response = self.client.post("/api/auth/login", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def auth_headers(self, login: str, password: str, **extra_payload) -> dict[str, str]:
        tokens = self.login(login, password, **extra_payload)
        return {"Authorization": f"Bearer {tokens['access_token']}"}

    def get_user_id(self, login: str) -> int:
        session = self.SessionLocal()
        try:
            user_id = session.scalar(select(CrmUser.id).where(CrmUser.login == login))
            assert user_id is not None
            return user_id
        finally:
            session.close()

    def test_login_creates_device_session(self) -> None:
        tokens = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Pixel 9")
        self.assertEqual(tokens["device_type"], "mobile")
        self.assertIsNotNone(tokens["refresh_token"])

        session = self.SessionLocal()
        try:
            user_id = self.get_user_id("employee")
            rows = UserSessionRepository(session).list_by_user_id(user_id)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].id, tokens["session_id"])
            self.assertEqual(rows[0].device_name, "Pixel 9")
            self.assertEqual(rows[0].device_type, "mobile")
            self.assertIsNotNone(rows[0].refresh_token_hash)
            self.assertNotEqual(rows[0].refresh_token_hash, tokens["refresh_token"])
        finally:
            session.close()

    def test_refresh_rotation_replaces_previous_session(self) -> None:
        tokens = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Android")

        refreshed = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        refreshed_payload = refreshed.json()

        self.assertNotEqual(refreshed_payload["refresh_token"], tokens["refresh_token"])
        self.assertNotEqual(refreshed_payload["session_id"], tokens["session_id"])

        session = self.SessionLocal()
        try:
            original = session.get(CrmUserSession, tokens["session_id"])
            rotated = session.get(CrmUserSession, refreshed_payload["session_id"])
            self.assertIsNotNone(original)
            self.assertIsNotNone(rotated)
            self.assertEqual(original.revoke_reason, "rotated")
            self.assertEqual(original.replaced_by_session_id, rotated.id)
            self.assertIsNone(rotated.revoked_at)
        finally:
            session.close()

    def test_refresh_token_reuse_revokes_whole_family(self) -> None:
        tokens = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Android")
        refreshed = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        new_refresh = refreshed.json()["refresh_token"]

        replay = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(replay.status_code, 401, replay.text)

        family_revoked = self.client.post("/api/auth/refresh", json={"refresh_token": new_refresh})
        self.assertEqual(family_revoked.status_code, 401, family_revoked.text)

    def test_web_refresh_reuse_returns_concurrent_retry_hint(self) -> None:
        response = self.client.post(
            "/api/auth/login",
            json={"login": "employee", "password": "Employee test passphrase 2026!", "device_type": "web", "device_name": "Safari"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        old_refresh = self.client.cookies.get("crm_refresh_token")
        self.assertIsNotNone(old_refresh)

        refreshed = self.client.post("/api/auth/refresh")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)

        replay = self.client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
        self.assertEqual(replay.status_code, 401, replay.text)
        self.assertEqual(replay.json()["error"]["code"], "refresh_concurrent")

    def test_logout_revokes_only_current_device(self) -> None:
        first = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        second = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Tablet")

        logout = self.client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {first['access_token']}"},
        )
        self.assertEqual(logout.status_code, 200, logout.text)

        first_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
        self.assertEqual(first_refresh.status_code, 401, first_refresh.text)

        second_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": second["refresh_token"]})
        self.assertEqual(second_refresh.status_code, 200, second_refresh.text)

    def test_logout_all_revokes_all_devices(self) -> None:
        first = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        second = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Tablet")

        response = self.client.post(
            "/api/auth/logout-all",
            headers={"Authorization": f"Bearer {first['access_token']}"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertGreaterEqual(response.json()["revoked_sessions_count"], 2)

        first_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
        self.assertEqual(first_refresh.status_code, 401, first_refresh.text)
        second_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": second["refresh_token"]})
        self.assertEqual(second_refresh.status_code, 401, second_refresh.text)

    def test_get_sessions_returns_active_devices(self) -> None:
        current = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        self.login("employee", "Employee test passphrase 2026!", device_type="web", device_name="Chrome")

        response = self.client.get(
            "/api/auth/sessions",
            headers={"Authorization": f"Bearer {current['access_token']}"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 2)
        self.assertTrue(any(item["is_current"] for item in response.json()))
        device_names = {item["device_name"] for item in response.json()}
        self.assertIn("Phone", device_names)
        self.assertIn("Chrome", device_names)

    def test_revoke_one_device_keeps_other_device_active(self) -> None:
        first = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        second = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Tablet")

        response = self.client.delete(
            f"/api/auth/sessions/{first['session_id']}",
            headers={"Authorization": f"Bearer {second['access_token']}"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["revoked_session_id"], first["session_id"])

        first_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
        self.assertEqual(first_refresh.status_code, 401, first_refresh.text)
        second_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": second["refresh_token"]})
        self.assertEqual(second_refresh.status_code, 200, second_refresh.text)

    def test_admin_revoke_sessions_invalidates_user_sessions(self) -> None:
        employee = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_id = self.get_user_id("employee")

        response = self.client.patch(f"/api/users/{employee_id}/revoke-sessions", headers=admin_headers)
        self.assertEqual(response.status_code, 200, response.text)

        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {employee['access_token']}"})
        self.assertEqual(me.status_code, 401, me.text)

        refresh = self.client.post("/api/auth/refresh", json={"refresh_token": employee["refresh_token"]})
        self.assertEqual(refresh.status_code, 401, refresh.text)

    def test_admin_can_view_user_sessions(self) -> None:
        self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        self.login("employee", "Employee test passphrase 2026!", device_type="web", device_name="Chrome")
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_id = self.get_user_id("employee")

        response = self.client.get(f"/api/users/{employee_id}/sessions", headers=admin_headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 2)
        device_names = {item["device_name"] for item in response.json()}
        self.assertIn("Phone", device_names)
        self.assertIn("Chrome", device_names)

    def test_password_reset_invalidates_existing_sessions(self) -> None:
        employee = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Phone")
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_id = self.get_user_id("employee")

        response = self.client.patch(
            f"/api/users/{employee_id}/reset-password",
            json={"new_password": "Employee replacement passphrase 2026!"},
            headers=admin_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)

        refresh = self.client.post("/api/auth/refresh", json={"refresh_token": employee["refresh_token"]})
        self.assertEqual(refresh.status_code, 401, refresh.text)

        new_login = self.client.post("/api/auth/login", json={"login": "employee", "password": "Employee replacement passphrase 2026!"})
        self.assertEqual(new_login.status_code, 200, new_login.text)

    def test_disabled_user_cannot_refresh(self) -> None:
        employee = self.login("employee", "Employee test passphrase 2026!", device_type="mobile")
        admin_headers = self.auth_headers("admin", "Admin test passphrase 2026!")
        employee_id = self.get_user_id("employee")

        response = self.client.patch(
            f"/api/users/{employee_id}/active",
            json={"is_active": False},
            headers=admin_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)

        refresh = self.client.post("/api/auth/refresh", json={"refresh_token": employee["refresh_token"]})
        self.assertEqual(refresh.status_code, 401, refresh.text)

    def test_inactivity_expiry_blocks_refresh(self) -> None:
        employee = self.login("employee", "Employee test passphrase 2026!", device_type="mobile")

        session = self.SessionLocal()
        try:
            session_row = session.get(CrmUserSession, employee["session_id"])
            self.assertIsNotNone(session_row)
            session_row.expires_at = session_row.created_at
            session.commit()
        finally:
            session.close()

        refresh = self.client.post("/api/auth/refresh", json={"refresh_token": employee["refresh_token"]})
        self.assertEqual(refresh.status_code, 401, refresh.text)

    def test_absolute_expiry_blocks_refresh(self) -> None:
        employee = self.login("employee", "Employee test passphrase 2026!", device_type="mobile")

        session = self.SessionLocal()
        try:
            session_row = session.get(CrmUserSession, employee["session_id"])
            self.assertIsNotNone(session_row)
            session_row.absolute_expires_at = session_row.created_at
            session.commit()
        finally:
            session.close()

        refresh = self.client.post("/api/auth/refresh", json={"refresh_token": employee["refresh_token"]})
        self.assertEqual(refresh.status_code, 401, refresh.text)

    def test_web_contract_uses_cookie_and_rotates_without_relogin(self) -> None:
        response = self.client.post(
            "/api/auth/login",
            json={"login": "employee", "password": "Employee test passphrase 2026!", "device_type": "web", "device_name": "Safari"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["device_type"], "web")
        self.assertIsNone(payload["refresh_token"])

        set_cookie = response.headers.get("set-cookie", "")
        self.assertIn("crm_refresh_token=", set_cookie)
        self.assertIn("HttpOnly", set_cookie)
        self.assertIn("SameSite=lax", set_cookie)
        self.assertIn("expires=", set_cookie.lower())

        refreshed = self.client.post("/api/auth/refresh")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["device_type"], "web")
        self.assertIsNone(refreshed.json()["refresh_token"])
        self.assertIn("expires=", refreshed.headers.get("set-cookie", "").lower())

    def test_mobile_contract_returns_refresh_token_and_refreshes_without_relogin(self) -> None:
        mobile = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="iPhone")
        self.assertIsNotNone(mobile["refresh_token"])

        refreshed = self.client.post("/api/auth/refresh", json={"refresh_token": mobile["refresh_token"]})
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertIsNotNone(refreshed.json()["refresh_token"])

    def test_session_cleanup_purges_only_stale_rows(self) -> None:
        stale = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Old phone")
        fresh = self.login("employee", "Employee test passphrase 2026!", device_type="mobile", device_name="Current phone")

        session = self.SessionLocal()
        try:
            stale_row = session.get(CrmUserSession, stale["session_id"])
            fresh_row = session.get(CrmUserSession, fresh["session_id"])
            self.assertIsNotNone(stale_row)
            self.assertIsNotNone(fresh_row)
            stale_row.revoked_at = stale_row.created_at
            stale_row.revoke_reason = "logout"
            fresh_row.revoked_at = fresh_row.created_at
            fresh_row.revoke_reason = "logout"
            result = SessionHousekeepingService(session).purge_stale_sessions(retention_days=30, dry_run=True)
            self.assertEqual(result.candidate_count, 0)

            stale_row.revoked_at = stale_row.created_at - timedelta(days=400)
            fresh_row.revoked_at = None
            fresh_row.revoke_reason = None
            session.commit()

            result = SessionHousekeepingService(session).purge_stale_sessions(retention_days=30, dry_run=False)
            self.assertEqual(result.candidate_count, 1)
            self.assertEqual(result.deleted_count, 1)
            self.assertIsNone(session.get(CrmUserSession, stale["session_id"]))
            self.assertIsNotNone(session.get(CrmUserSession, fresh["session_id"]))
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main()
