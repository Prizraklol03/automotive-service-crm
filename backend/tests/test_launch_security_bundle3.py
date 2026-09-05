from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import photo_share as photo_share_router_module  # noqa: E402
from app.core.client_ip import resolve_client_ip  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.core.security import InMemoryRateLimiter, hash_password, validate_new_password  # noqa: E402
from app.crm.api.routers import integrations as integrations_router_module  # noqa: E402
from app.crm.services.auth_service import AuthService  # noqa: E402
from app.crm.services.order_photo_service import OrderPhotoService  # noqa: E402


def make_request(
    *,
    peer: str,
    forwarded_for: str | None = None,
    real_ip: str | None = None,
) -> Request:
    headers = [] if forwarded_for is None else [(b"x-forwarded-for", forwarded_for.encode("ascii"))]
    if real_ip is not None:
        headers.append((b"x-real-ip", real_ip.encode("ascii")))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (peer, 12345)})


class LaunchSecurityBundle3UnitTestCase(unittest.TestCase):
    def setUp(self) -> None:
        integrations_router_module.reset_external_lead_rate_limiter()
        photo_share_router_module.reset_public_share_rate_limiter()

    def tearDown(self) -> None:
        integrations_router_module.reset_external_lead_rate_limiter()
        photo_share_router_module.reset_public_share_rate_limiter()

    def test_untrusted_peer_cannot_spoof_forwarded_client_ip(self) -> None:
        request = make_request(peer="198.51.100.10", forwarded_for="203.0.113.99")
        self.assertEqual(resolve_client_ip(request, "192.0.2.0/8"), "198.51.100.10")

    def test_missing_trusted_proxy_configuration_ignores_forwarded_headers(self) -> None:
        request = make_request(
            peer="198.51.100.10",
            forwarded_for="203.0.113.99",
            real_ip="203.0.113.98",
        )
        self.assertEqual(resolve_client_ip(request, ""), "198.51.100.10")

    def test_invalid_trusted_proxy_configuration_fails_closed_to_peer(self) -> None:
        request = make_request(
            peer="198.51.100.10",
            forwarded_for="203.0.113.99",
            real_ip="203.0.113.98",
        )
        self.assertEqual(resolve_client_ip(request, "not-a-cidr"), "198.51.100.10")

    def test_trusted_proxy_chain_uses_nearest_untrusted_address(self) -> None:
        request = make_request(peer="192.0.2.8", forwarded_for="192.0.2.44, 198.51.100.25")
        self.assertEqual(resolve_client_ip(request, "192.0.2.0/8"), "198.51.100.25")

    def test_malformed_forwarded_header_fails_closed_to_peer(self) -> None:
        request = make_request(peer="192.0.2.8", forwarded_for="not-an-ip")
        self.assertEqual(resolve_client_ip(request, "192.0.2.0/8"), "192.0.2.8")

    def test_password_policy_rejects_short_and_project_default_values(self) -> None:
        for password in ("short", "example-password-45", "aaaaaaaaaaaa"):
            with self.subTest(password=password), self.assertRaises(AppError):
                validate_new_password(password)

    def test_password_policy_accepts_long_passphrase(self) -> None:
        self.assertEqual(validate_new_password("Correct horse battery staple 2026"), "Correct horse battery staple 2026")

    def test_rate_limit_error_includes_retry_after_without_key_material(self) -> None:
        limiter = InMemoryRateLimiter()
        limiter.consume("private-key-material", max_attempts=1, window_seconds=30)
        with self.assertRaises(AppError) as raised:
            limiter.consume("private-key-material", max_attempts=1, window_seconds=30)
        self.assertEqual(raised.exception.status_code, 429)
        self.assertGreater(int(raised.exception.headers["Retry-After"]), 0)
        self.assertNotIn("private-key-material", str(raised.exception))

    def test_external_credential_is_checked_before_body_parsing(self) -> None:
        calls = {"authenticated": 0, "submitted": 0}

        class FakeExternalLeadService:
            def __init__(self, _db) -> None:
                pass

            def authenticate_source(self, integration_key):
                calls["authenticated"] += 1
                raise AppError(code="auth_failed", message="Unauthorized", status_code=401)

            def submit_authenticated(self, **_kwargs):
                calls["submitted"] += 1
                raise AssertionError("submit must not be called")

        app = self._make_app(integrations_router_module.router, "/api/integrations")
        with patch.object(integrations_router_module, "ExternalLeadService", FakeExternalLeadService), TestClient(app) as client:
            response = client.post(
                "/api/integrations/external-leads",
                headers={"X-Integration-Key": "invalid", "Content-Type": "application/octet-stream"},
                content=b"not-json-private-body",
            )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"success": False, "error": "unauthorized"})
        self.assertEqual(calls, {"authenticated": 1, "submitted": 0})
        self.assertNotIn("not-json-private-body", response.text)

    def test_external_rate_limit_ignores_spoofed_forwarded_header(self) -> None:
        class RejectingExternalLeadService:
            def __init__(self, _db) -> None:
                pass

            def authenticate_source(self, _integration_key):
                raise AppError(code="auth_failed", message="Unauthorized", status_code=401)

        settings = get_settings()
        original_attempts = settings.external_lead_rate_limit_attempts
        settings.external_lead_rate_limit_attempts = 2
        app = self._make_app(integrations_router_module.router, "/api/integrations")
        try:
            with patch.object(integrations_router_module, "ExternalLeadService", RejectingExternalLeadService), TestClient(app) as client:
                responses = [
                    client.post(
                        "/api/integrations/external-leads",
                        headers={
                            "X-Forwarded-For": f"203.0.113.{index}",
                            "X-Real-IP": f"203.0.113.{100 + index}",
                        },
                        json={"customer": {"phone": "+70000000001"}},
                    )
                    for index in range(1, 4)
                ]
        finally:
            settings.external_lead_rate_limit_attempts = original_attempts
        self.assertEqual([response.status_code for response in responses], [401, 401, 429])
        self.assertGreater(int(responses[-1].headers["Retry-After"]), 0)

    def test_valid_external_lead_keeps_success_contract(self) -> None:
        class AcceptingExternalLeadService:
            def __init__(self, _db) -> None:
                pass

            def authenticate_source(self, _integration_key):
                return SimpleNamespace(id=7)

            def submit_authenticated(self, **_kwargs):
                return SimpleNamespace(
                    lead=SimpleNamespace(id=31, created_order_id=None),
                    client=SimpleNamespace(id=41),
                    status="created",
                )

        app = self._make_app(integrations_router_module.router, "/api/integrations")
        with patch.object(integrations_router_module, "ExternalLeadService", AcceptingExternalLeadService), TestClient(app) as client:
            response = client.post(
                "/api/integrations/external-leads",
                headers={"X-Integration-Key": "els_valid_test_key"},
                json={"customer": {"phone": "+70000000001"}},
            )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(
            response.json(),
            {"success": True, "leadId": 31, "customerId": 41, "orderId": None, "status": "created"},
        )

    def test_external_body_limit_rejects_before_submission(self) -> None:
        calls = {"submitted": 0}

        class AcceptingExternalLeadService:
            def __init__(self, _db) -> None:
                pass

            def authenticate_source(self, _integration_key):
                return SimpleNamespace(id=7)

            def submit_authenticated(self, **_kwargs):
                calls["submitted"] += 1
                raise AssertionError("oversized request must not be submitted")

        settings = get_settings()
        original_limit = settings.external_lead_max_body_bytes
        settings.external_lead_max_body_bytes = 1024
        app = self._make_app(integrations_router_module.router, "/api/integrations")
        try:
            with patch.object(integrations_router_module, "ExternalLeadService", AcceptingExternalLeadService), TestClient(app) as client:
                response = client.post(
                    "/api/integrations/external-leads",
                    headers={"X-Integration-Key": "els_valid_test_key"},
                    json={"customer": {"phone": "+70000000001"}, "request": {"message": "x" * 2000}},
                )
        finally:
            settings.external_lead_max_body_bytes = original_limit
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(calls["submitted"], 0)

    def test_public_photo_response_uses_minimal_opaque_contract_and_safe_headers(self) -> None:
        opaque_key = "a" * 43

        class FakeOrderPhotoService:
            def __init__(self, _db) -> None:
                pass

            def list_by_share_token(self, _token):
                return [SimpleNamespace(id=91, stage="before", sort_order=0)], 12

            def get_public_photo_key(self, _token, _photo_id):
                return opaque_key

            def get_shared_file_bytes(self, _token, _photo_key, *, thumbnail):
                return b"jpeg-content", "image/jpeg"

        app = self._make_app(photo_share_router_module.router, "/api/p")
        with patch.object(photo_share_router_module, "OrderPhotoService", FakeOrderPhotoService), TestClient(app) as client:
            listed = client.get(f"/api/p/{'t' * 43}")
            served = client.get(f"/api/p/{'t' * 43}/photos/{opaque_key}/file")
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json(), [{"photo_key": opaque_key, "stage": "before", "sort_order": 0}])
        self.assertEqual(listed.headers["Cache-Control"], "no-store")
        self.assertEqual(served.status_code, 200, served.text)
        self.assertEqual(served.headers["Cache-Control"], "no-store")
        self.assertEqual(served.headers["X-Content-Type-Options"], "nosniff")

    def test_unknown_and_revoked_photo_tokens_have_same_external_error(self) -> None:
        settings = get_settings()
        original_enabled = settings.crm_public_share_enabled
        settings.crm_public_share_enabled = True
        try:
            unknown_service = OrderPhotoService.__new__(OrderPhotoService)
            unknown_service.session = SimpleNamespace(scalar=lambda _statement: None)
            revoked_service = OrderPhotoService.__new__(OrderPhotoService)
            revoked_service.session = SimpleNamespace(
                scalar=lambda _statement: SimpleNamespace(
                    photo_share_revoked_at=object(),
                    photo_share_expires_at=None,
                )
            )
            errors = []
            for service in (unknown_service, revoked_service):
                with self.assertRaises(AppError) as raised:
                    service._resolve_share_order("t" * 43)
                errors.append((raised.exception.status_code, raised.exception.code, raised.exception.message))
        finally:
            settings.crm_public_share_enabled = original_enabled
        self.assertEqual(errors[0], errors[1])

    def test_authenticate_returns_same_error_for_unknown_user_and_wrong_password(self) -> None:
        valid_hash = hash_password("Correct horse battery staple 2026")
        known_user = SimpleNamespace(is_active=True, password_hash=valid_hash)
        errors = []
        for user in (None, known_user):
            service = AuthService.__new__(AuthService)
            service.users = SimpleNamespace(get_by_login=lambda _login, result=user: result)
            with self.assertRaises(AppError) as raised:
                service.authenticate("account", "wrong-password")
            errors.append((raised.exception.status_code, raised.exception.code, raised.exception.message))
        self.assertEqual(errors[0], errors[1])

    @staticmethod
    def _make_app(router, prefix: str) -> FastAPI:
        app = FastAPI()
        register_exception_handlers(app)
        app.include_router(router, prefix=prefix)

        def override_get_db():
            yield object()

        app.dependency_overrides[get_db] = override_get_db
        return app


if __name__ == "__main__":
    unittest.main()
