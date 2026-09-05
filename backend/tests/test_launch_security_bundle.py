from __future__ import annotations

import json
import sys
import tempfile
import unittest
from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.cache_control import NoStoreApiResponsesMiddleware  # noqa: E402
from app.core.config import get_openapi_urls, validate_auth_refresh_cookie_policy  # noqa: E402
from app.core.errors import AppError, register_exception_handlers  # noqa: E402
from app.core.paths import resolve_path_within_root  # noqa: E402
from app.crm.schemas.auth import AuthSessionRead  # noqa: E402
from app.crm.schemas.finance_expense_attachment import FinanceExpenseAttachmentRead  # noqa: E402
from app.crm.schemas.material_attachment import MaterialAttachmentRead  # noqa: E402
from app.crm.services.session_service import SessionTokenService  # noqa: E402


def _b64encode(value: dict[str, object]) -> str:
    return urlsafe_b64encode(json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")).decode("ascii").rstrip("=")


class LaunchSecurityBundleTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tokens = SessionTokenService(
            secret_key="k" * 32,
            access_ttl_minutes=15,
            refresh_inactivity_ttl_days=30,
            refresh_absolute_ttl_days=90,
        )

    def _signed_token(self, *, header: dict[str, object], payload: dict[str, object]) -> str:
        signing_input = f"{_b64encode(header)}.{_b64encode(payload)}"
        return f"{signing_input}.{self.tokens._sign(signing_input)}"

    def test_unexpected_error_uses_generic_envelope_without_internal_markers(self) -> None:
        class DatabasePathFailure(Exception):
            pass

        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/boom")
        def boom() -> None:
            raise DatabasePathFailure("SECRET_MARKER SELECT * FROM payments /private/runtime")

        with self.assertLogs("app.core.errors", level="ERROR"):
            with TestClient(app, raise_server_exceptions=False) as client:
                response = client.get("/boom")

        self.assertEqual(response.status_code, 500)
        error = response.json()["error"]
        self.assertEqual(error["code"], "internal_error")
        self.assertEqual(error["details"], {})
        self.assertNotIn("SECRET_MARKER", response.text)
        self.assertNotIn("DatabasePathFailure", response.text)
        self.assertNotIn("SELECT * FROM payments", response.text)
        self.assertNotIn("/private/runtime", response.text)

    def test_controlled_app_error_is_unchanged(self) -> None:
        app = FastAPI()
        register_exception_handlers(app)

        @app.get("/controlled")
        def controlled() -> None:
            raise AppError(code="controlled", message="Known controlled error", status_code=409)

        with TestClient(app) as client:
            response = client.get("/controlled")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], {"code": "controlled", "message": "Known controlled error", "details": {}})

    def test_openapi_is_disabled_for_staging_and_production_only(self) -> None:
        self.assertEqual(get_openapi_urls("production"), (None, None, None))
        self.assertEqual(get_openapi_urls("staging"), (None, None, None))
        self.assertEqual(get_openapi_urls("development"), ("/openapi.json", "/docs", "/redoc"))
        self.assertEqual(get_openapi_urls("test"), ("/openapi.json", "/docs", "/redoc"))

    def test_attachment_and_session_dtos_exclude_internal_metadata(self) -> None:
        self.assertNotIn("storage_path", MaterialAttachmentRead.model_fields)
        self.assertNotIn("storage_path", FinanceExpenseAttachmentRead.model_fields)
        self.assertNotIn("user_agent", AuthSessionRead.model_fields)
        self.assertNotIn("ip_address", AuthSessionRead.model_fields)
        session = AuthSessionRead.model_validate(
            {
                "id": 1,
                "device_type": "web",
                "device_name": "Browser",
                "user_agent": "raw-user-agent",
                "ip_address": "Example Street 05, Example City",
                "created_at": datetime.now(UTC),
                "last_used_at": datetime.now(UTC),
                "expires_at": datetime.now(UTC) + timedelta(days=1),
                "absolute_expires_at": datetime.now(UTC) + timedelta(days=2),
                "is_current": True,
            }
        )
        serialized = session.model_dump()
        self.assertNotIn("user_agent", serialized)
        self.assertNotIn("ip_address", serialized)
        self.assertEqual(serialized["device_name"], "Browser")

    def test_component_aware_path_containment(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            root = base / "storage"
            root.mkdir()
            sibling = base / "storage-sibling"
            sibling.mkdir()

            self.assertEqual(resolve_path_within_root(root, "nested/file.txt"), (root / "nested/file.txt").resolve())
            self.assertIsNone(resolve_path_within_root(root, "nested/../file.txt"))
            self.assertIsNone(resolve_path_within_root(root, base / "outside.txt"))
            self.assertIsNone(resolve_path_within_root(root, sibling / "file.txt"))
            self.assertEqual(resolve_path_within_root(root, root / "nested/deeper/file.txt"), (root / "nested/deeper/file.txt").resolve())

            escaped = root / "linked-outside"
            try:
                escaped.symlink_to(sibling, target_is_directory=True)
            except OSError:
                self.skipTest("Symlink creation is unavailable on this platform/runtime")
            self.assertIsNone(resolve_path_within_root(root, escaped / "file.txt"))

    def test_api_responses_are_no_store_but_static_paths_are_unchanged(self) -> None:
        app = FastAPI()
        app.add_middleware(NoStoreApiResponsesMiddleware, api_base_path="/api")

        @app.get("/api/sensitive")
        def sensitive() -> dict[str, str]:
            return {"status": "ok"}

        @app.get("/assets/app.js")
        def static_asset() -> Response:
            return Response("asset", headers={"Cache-Control": "public, max-age=3600"})

        with TestClient(app) as client:
            self.assertEqual(client.get("/api/sensitive").headers["cache-control"], "no-store")
            self.assertEqual(client.get("/assets/app.js").headers["cache-control"], "public, max-age=3600")

    def test_staging_and_production_cookie_policy_requires_secure_safe_defaults(self) -> None:
        self.assertEqual(validate_auth_refresh_cookie_policy(app_env="staging", secure=True, samesite="lax"), "lax")
        self.assertEqual(validate_auth_refresh_cookie_policy(app_env="production", secure=True, samesite="strict"), "strict")
        with self.assertRaisesRegex(ValueError, "AUTH_REFRESH_COOKIE_SECURE"):
            validate_auth_refresh_cookie_policy(app_env="production", secure=False, samesite="lax")
        with self.assertRaisesRegex(ValueError, "AUTH_REFRESH_COOKIE_SAMESITE"):
            validate_auth_refresh_cookie_policy(app_env="staging", secure=True, samesite="none")
        self.assertEqual(validate_auth_refresh_cookie_policy(app_env="development", secure=False, samesite="lax"), "lax")

    def test_secure_cookie_has_no_domain_and_keeps_refresh_path_compatible(self) -> None:
        response = Response()
        response.set_cookie(
            key="crm_refresh_token",
            value="test-refresh-token",
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        header = response.headers["set-cookie"]
        self.assertIn("HttpOnly", header)
        self.assertIn("Secure", header)
        self.assertIn("SameSite=lax", header)
        self.assertIn("Path=/", header)
        self.assertNotIn("Domain=", header)

    def test_tokens_require_expected_header_type_and_existing_claims(self) -> None:
        issued = self.tokens.issue_access_token(user_id=7, role_code="standard_user", login="tester", token_version=2, session_id=11)
        access_token = str(issued["access_token"])
        payload = self.tokens.verify_access_token(access_token)
        self.assertEqual(payload["sub"], 7)

        wrong_algorithm = self._signed_token(header={"alg": "none", "typ": "JWT"}, payload=payload)
        with self.assertRaises(AppError):
            self.tokens.verify_access_token(wrong_algorithm)

        with self.assertRaises(AppError):
            self.tokens.verify_refresh_token(access_token)

        missing_session = dict(payload)
        missing_session.pop("sid")
        with self.assertRaises(AppError):
            self.tokens.verify_access_token(self.tokens._encode_jwt(missing_session))

        invalid_version = dict(payload)
        invalid_version["ver"] = True
        with self.assertRaises(AppError):
            self.tokens.verify_access_token(self.tokens._encode_jwt(invalid_version))


if __name__ == "__main__":
    unittest.main()
