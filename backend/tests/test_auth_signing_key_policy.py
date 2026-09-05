from __future__ import annotations

import logging
import os
import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import (  # noqa: E402
    AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT,
    AUTH_SECRET_KEY_MIN_BYTES,
    get_settings,
    validate_auth_secret_key,
)
from app.crm.services.session_service import SessionTokenService  # noqa: E402


class AuthSigningKeyPolicyTestCase(unittest.TestCase):
    def assert_rejected_without_secret_leak(self, *, app_env: str, secret_key: str | None) -> None:
        captured_logs = StringIO()
        handler = logging.StreamHandler(captured_logs)
        root_logger = logging.getLogger()
        root_logger.addHandler(handler)
        try:
            with self.assertRaises(ValueError) as raised:
                validate_auth_secret_key(app_env=app_env, secret_key=secret_key)
        finally:
            root_logger.removeHandler(handler)

        error_text = str(raised.exception)
        self.assertIn("AUTH_SECRET_KEY", error_text)
        if secret_key:
            self.assertNotIn(secret_key, error_text)
            self.assertNotIn(secret_key, captured_logs.getvalue())

    def test_production_rejects_missing_key(self) -> None:
        self.assert_rejected_without_secret_leak(app_env="production", secret_key=None)

    def test_production_rejects_empty_key(self) -> None:
        self.assert_rejected_without_secret_leak(app_env="production", secret_key="")

    def test_production_rejects_whitespace_key(self) -> None:
        self.assert_rejected_without_secret_leak(app_env="production", secret_key=" \t ")

    def test_production_rejects_development_default(self) -> None:
        self.assert_rejected_without_secret_leak(
            app_env="production",
            secret_key=AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT,
        )

    def test_production_rejects_key_shorter_than_32_utf8_bytes(self) -> None:
        self.assert_rejected_without_secret_leak(
            app_env="production",
            secret_key="x" * (AUTH_SECRET_KEY_MIN_BYTES - 1),
        )

    def test_utf8_byte_length_is_used_instead_of_character_count(self) -> None:
        key = "\u044f" * 16
        self.assertEqual(len(key), 16)
        self.assertEqual(len(key.encode("utf-8")), AUTH_SECRET_KEY_MIN_BYTES)
        self.assertEqual(validate_auth_secret_key(app_env="production", secret_key=key), key)

    def test_production_accepts_valid_key(self) -> None:
        key = "p" * AUTH_SECRET_KEY_MIN_BYTES
        self.assertEqual(validate_auth_secret_key(app_env="production", secret_key=key), key)

    def test_staging_applies_same_fail_closed_policy(self) -> None:
        self.assert_rejected_without_secret_leak(
            app_env="staging",
            secret_key=AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT,
        )
        key = "s" * AUTH_SECRET_KEY_MIN_BYTES
        self.assertEqual(validate_auth_secret_key(app_env="staging", secret_key=key), key)

    def test_development_and_test_allow_canonical_development_default(self) -> None:
        for app_env in ("development", "dev", "test", "testing"):
            with self.subTest(app_env=app_env):
                self.assertEqual(
                    validate_auth_secret_key(
                        app_env=app_env,
                        secret_key=AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT,
                    ),
                    AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT,
                )

    def test_unknown_environment_fails_closed(self) -> None:
        self.assert_rejected_without_secret_leak(
            app_env="prod-typo",
            secret_key=AUTH_SECRET_KEY_DEVELOPMENT_DEFAULT,
        )

    def test_canonical_settings_path_rejects_missing_production_key_before_runtime_use(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_dir = Path(temp_dir)
            with (
                patch.dict(os.environ, {"APP_ENV": "production"}, clear=True),
                patch("app.core.config.get_env_file", return_value=None),
                patch("app.core.config.get_runtime_dir", return_value=runtime_dir),
                patch("app.core.config.get_document_templates_dir", return_value=runtime_dir),
            ):
                get_settings.cache_clear()
                try:
                    with self.assertRaisesRegex(ValueError, "AUTH_SECRET_KEY"):
                        get_settings()
                finally:
                    get_settings.cache_clear()

    def test_canonical_settings_path_accepts_valid_production_key(self) -> None:
        key = "g" * AUTH_SECRET_KEY_MIN_BYTES
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_dir = Path(temp_dir)
            with (
                patch.dict(
                    os.environ,
                    {
                        "APP_ENV": "production",
                        "DATABASE_URL": "postgresql+psycopg://launch_gate:synthetic_password@db:5432/crm",
                        "AUTH_SECRET_KEY": key,
                        "AUTH_REFRESH_COOKIE_SECURE": "true",
                        "AUTH_REFRESH_COOKIE_SAMESITE": "lax",
                        "CRM_INSECURE_HTTP_ALLOWED": "false",
                        "CRM_DATA_ENCRYPTION_KEY": "synthetic-data-encryption-key",
                        "CRM_DATA_ENCRYPTION_KEY_ID": "v1",
                        "CRM_DATA_HASH_KEY": "synthetic-data-hash-key",
                        "CRM_FILE_ENCRYPTION_KEY": "synthetic-file-encryption-key",
                        "CRM_FILE_ENCRYPTION_KEY_ID": "v1",
                        "CORS_ALLOWED_ORIGINS": "https://crm.test.invalid",
                        "TRUSTED_HOSTS": "crm.test.invalid,backend,nginx",
                        "TRUSTED_PROXY_CIDRS": "192.0.2.0/24",
                    },
                    clear=True,
                ),
                patch("app.core.config.get_env_file", return_value=None),
                patch("app.core.config.get_runtime_dir", return_value=runtime_dir),
                patch("app.core.config.get_document_templates_dir", return_value=runtime_dir),
            ):
                get_settings.cache_clear()
                try:
                    self.assertEqual(get_settings().auth_secret_key, key)
                finally:
                    get_settings.cache_clear()

    def test_access_token_round_trip_is_unchanged_with_valid_key(self) -> None:
        service = SessionTokenService(
            secret_key="t" * AUTH_SECRET_KEY_MIN_BYTES,
            access_ttl_minutes=15,
            refresh_inactivity_ttl_days=30,
            refresh_absolute_ttl_days=90,
        )
        issued = service.issue_access_token(
            user_id=17,
            role_code="standard_user",
            login="tester",
            token_version=3,
            session_id=41,
        )

        payload = service.verify_access_token(str(issued["access_token"]))

        self.assertEqual(issued["token_type"], "bearer")
        self.assertEqual(issued["expires_in"], 900)
        self.assertEqual(payload["sub"], 17)
        self.assertEqual(payload["role"], "standard_user")
        self.assertEqual(payload["login"], "tester")
        self.assertEqual(payload["ver"], 3)
        self.assertEqual(payload["sid"], 41)
        self.assertEqual(payload["type"], "access")

if __name__ == "__main__":
    unittest.main()
