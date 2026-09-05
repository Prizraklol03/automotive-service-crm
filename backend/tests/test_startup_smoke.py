from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
from postgres_test_utils import create_empty_database_handle


class StartupSmokeTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.database_handle = create_empty_database_handle()
        self.previous_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = self.database_handle.database_url
        get_settings.cache_clear()

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.previous_database_url
        get_settings.cache_clear()
        self.database_handle.close()

    def make_config(self) -> Config:
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        config.set_main_option("sqlalchemy.url", self.database_handle.database_url)
        return config

    def test_app_starts_and_health_endpoint_returns_200(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_dir = Path(temp_dir) / "runtime"
            runtime_dir.mkdir(parents=True, exist_ok=True)
            previous_runtime_dir = os.environ.get("APP_RUNTIME_DIR")
            try:
                os.environ["APP_RUNTIME_DIR"] = str(runtime_dir)
                os.environ["DATABASE_URL"] = self.database_handle.database_url
                get_settings.cache_clear()
                command.upgrade(self.make_config(), "head")
            finally:
                if previous_runtime_dir is None:
                    os.environ.pop("APP_RUNTIME_DIR", None)
                else:
                    os.environ["APP_RUNTIME_DIR"] = previous_runtime_dir
                get_settings.cache_clear()

            env = os.environ.copy()
            env["APP_RUNTIME_DIR"] = str(runtime_dir)
            env["DATABASE_URL"] = self.database_handle.database_url
            env["TRUSTED_HOSTS"] = "testserver,localhost,127.0.0.1"
            env["CORS_ALLOWED_ORIGINS"] = "http://testserver"

            script = textwrap.dedent(
                f"""
                import sys

                sys.path.insert(0, r"{BACKEND_ROOT}")

                from fastapi.testclient import TestClient
                from unittest.mock import patch
                import alembic.command
                from app.core.config import get_settings

                get_settings.cache_clear()

                from app.main import app

                with patch.object(alembic.command, "upgrade", side_effect=AssertionError("startup must not auto-migrate")):
                    with TestClient(app) as client:
                        response = client.get("/api/health")
                        assert response.status_code == 200, response.text
                        payload = response.json()
                        assert payload["status"] == "ok", payload
                """
            )

            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=BACKEND_ROOT,
                env=env,
                text=True,
                capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()
