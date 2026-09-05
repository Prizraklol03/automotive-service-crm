from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from sqlalchemy.exc import SQLAlchemyError


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import validate_database_url  # noqa: E402
from postgres_test_utils import create_empty_database_handle, create_empty_schema_handle, get_postgres_test_url  # noqa: E402


class DatabaseUrlPolicyTestCase(unittest.TestCase):
    def test_validate_database_url_rejects_sqlite(self) -> None:
        with self.assertRaisesRegex(ValueError, "SQLite is no longer supported"):
            validate_database_url("sqlite:///./crm.db")

    def test_postgres_test_url_rejects_sqlite_env(self) -> None:
        with patch.dict(os.environ, {"TEST_DATABASE_URL": "sqlite:///./crm.db"}, clear=False):
            with self.assertRaisesRegex(RuntimeError, "SQLite is no longer supported"):
                get_postgres_test_url()

    def test_example_env_files_are_postgresql_only(self) -> None:
        example_files = [
            REPO_ROOT / ".env.example",
            REPO_ROOT / ".env.docker.local.example",
        ]
        for path in example_files:
            content = path.read_text(encoding="utf-8").lower()
            self.assertNotIn("sqlite://", content, path.name)
            self.assertNotIn("crm.db", content, path.name)

        root_env = REPO_ROOT / ".env"
        if root_env.exists():
            content = root_env.read_text(encoding="utf-8").lower()
            self.assertNotIn("sqlite://", content, root_env.name)

    def test_create_empty_database_handle_reports_postgresql_unavailable(self) -> None:
        fake_engine = Mock()
        fake_engine.connect.side_effect = SQLAlchemyError("boom")
        fake_engine.dispose = Mock()

        with patch.dict(os.environ, {"TEST_DATABASE_URL": "postgresql+psycopg://test_user:CHANGE_ME@127.0.0.1:5432/automotive_crm_test"}, clear=False):
            with patch("postgres_test_utils.create_engine", return_value=fake_engine):
                with self.assertRaisesRegex(RuntimeError, "PostgreSQL admin database is unavailable"):
                    create_empty_database_handle()

    def test_create_empty_schema_handle_reports_postgresql_unavailable(self) -> None:
        fake_engine = Mock()
        fake_engine.connect.side_effect = SQLAlchemyError("boom")
        fake_engine.dispose = Mock()

        with patch.dict(os.environ, {"TEST_DATABASE_URL": "postgresql+psycopg://test_user:CHANGE_ME@127.0.0.1:5432/automotive_crm_test"}, clear=False):
            with patch("postgres_test_utils.create_engine", return_value=fake_engine):
                with self.assertRaisesRegex(RuntimeError, "PostgreSQL test database is unavailable"):
                    create_empty_schema_handle()
