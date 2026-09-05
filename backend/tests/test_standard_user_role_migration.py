from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm.api.deps import get_session_token_service  # noqa: E402
from app.crm.models.role import CrmRole  # noqa: E402
from app.crm.models.user import CrmUser  # noqa: E402
from app.crm.models.user_permission import CrmUserPermission  # noqa: E402
from app.crm.models.user_session import CrmUserSession  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from postgres_test_utils import create_empty_database_handle  # noqa: E402


PREVIOUS_REVISION = "0056_client_name_blind_tokens"
CURRENT_REVISION = "0057_standard_user_role_code"


class StandardUserRoleMigrationTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ["CRM_DATA_ENCRYPTION_KEY"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        os.environ["CRM_DATA_HASH_KEY"] = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI="
        os.environ["CRM_FILE_ENCRYPTION_KEY"] = "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ="
        os.environ["CRM_INSECURE_HTTP_ALLOWED"] = "true"
        get_settings.cache_clear()

    def setUp(self) -> None:
        self.database_handle = create_empty_database_handle()
        self.previous_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = self.database_handle.database_url
        get_settings.cache_clear()
        self.engine = create_engine(self.database_handle.database_url, future=True, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )

    def tearDown(self) -> None:
        self.engine.dispose()
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

    def make_client(self) -> TestClient:
        app = FastAPI()
        register_exception_handlers(app)
        app.include_router(api_router, prefix="/api")

        def override_get_db():
            session: Session = self.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_get_db
        return TestClient(app)

    def seed_pre_migration_users(self) -> tuple[int, int, int]:
        session = self.SessionLocal()
        try:
            roles = {role.code: role for role in session.scalars(select(CrmRole)).all()}
            admin = UserService(session).create_user(
                UserCreate(
                    role_id=roles["admin"].id,
                    full_name="Demo Customer 21",
                    login="migration-admin",
                    password="migration-admin-pass",
                )
            )
            standard_user = UserService(session).create_user(
                UserCreate(
                    role_id=roles["employee"].id,
                    full_name="Demo Customer 22",
                    login="migration-standard-user",
                    password="migration-standard-user-pass",
                )
            )
            permission = CrmUserPermission(
                user_id=standard_user.id,
                permission_code="analytics.view",
                is_allowed=True,
                updated_by_user_id=admin.id,
            )
            session.add(permission)
            session.commit()
            session.refresh(permission)
            return admin.id, standard_user.id, permission.id
        finally:
            session.close()

    @staticmethod
    def login(client: TestClient, login: str, password: str) -> dict[str, object]:
        response = client.post(
            "/api/auth/login",
            json={"login": login, "password": password, "device_type": "mobile"},
        )
        assert response.status_code == 200, response.text
        return response.json()

    def test_supported_upgrade_invalidates_only_renamed_role_and_preserves_identity(self) -> None:
        config = self.make_config()
        command.upgrade(config, PREVIOUS_REVISION)
        admin_id, standard_user_id, permission_id = self.seed_pre_migration_users()

        with self.make_client() as client:
            old_admin_tokens = self.login(client, "migration-admin", "migration-admin-pass")
            old_standard_tokens = self.login(
                client,
                "migration-standard-user",
                "migration-standard-user-pass",
            )

            with self.engine.connect() as connection:
                old_role_id = connection.execute(
                    text("SELECT id FROM crm_roles WHERE code = 'employee'")
                ).scalar_one()
                old_user_role_id, old_token_version = connection.execute(
                    text("SELECT role_id, token_version FROM crm_users WHERE id = :user_id"),
                    {"user_id": standard_user_id},
                ).one()
                old_admin_token_version = connection.execute(
                    text("SELECT token_version FROM crm_users WHERE id = :user_id"),
                    {"user_id": admin_id},
                ).scalar_one()

            command.upgrade(config, CURRENT_REVISION)

            with self.engine.connect() as connection:
                role_rows = connection.execute(
                    text("SELECT id, code, name FROM crm_roles ORDER BY id")
                ).mappings().all()
                migrated_user = connection.execute(
                    text("SELECT role_id, token_version FROM crm_users WHERE id = :user_id"),
                    {"user_id": standard_user_id},
                ).one()
                migrated_admin_version = connection.execute(
                    text("SELECT token_version FROM crm_users WHERE id = :user_id"),
                    {"user_id": admin_id},
                ).scalar_one()
                permission = connection.execute(
                    text(
                        """
                        SELECT id, user_id, permission_code, is_allowed, updated_by_user_id
                        FROM crm_user_permissions
                        WHERE id = :permission_id
                        """
                    ),
                    {"permission_id": permission_id},
                ).one()
                standard_session = connection.execute(
                    text("SELECT revoked_at, revoke_reason FROM crm_user_sessions WHERE id = :session_id"),
                    {"session_id": old_standard_tokens["session_id"]},
                ).one()
                admin_session = connection.execute(
                    text("SELECT revoked_at, revoke_reason FROM crm_user_sessions WHERE id = :session_id"),
                    {"session_id": old_admin_tokens["session_id"]},
                ).one()

            standard_roles = [row for row in role_rows if row["code"] == "standard_user"]
            self.assertEqual(len(standard_roles), 1)
            self.assertEqual(standard_roles[0]["id"], old_role_id)
            self.assertEqual(standard_roles[0]["name"], "Standard User")
            self.assertNotIn("employee", {row["code"] for row in role_rows})
            self.assertEqual(migrated_user[0], old_user_role_id)
            self.assertEqual(migrated_user[1], old_token_version + 1)
            self.assertEqual(migrated_admin_version, old_admin_token_version)
            self.assertEqual(
                permission,
                (permission_id, standard_user_id, "analytics.view", True, admin_id),
            )
            self.assertIsNotNone(standard_session[0])
            self.assertEqual(standard_session[1], "role_code_migration")
            self.assertIsNone(admin_session[0])
            self.assertIsNone(admin_session[1])

            old_access = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {old_standard_tokens['access_token']}"},
            )
            self.assertEqual(old_access.status_code, 401, old_access.text)
            old_refresh = client.post(
                "/api/auth/refresh",
                json={"refresh_token": old_standard_tokens["refresh_token"]},
            )
            self.assertEqual(old_refresh.status_code, 401, old_refresh.text)

            admin_me = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {old_admin_tokens['access_token']}"},
            )
            self.assertEqual(admin_me.status_code, 200, admin_me.text)
            self.assertEqual(admin_me.json()["user"]["role_code"], "admin")

            command.downgrade(config, PREVIOUS_REVISION)
            with self.engine.connect() as connection:
                downgraded_role = connection.execute(
                    text("SELECT id, code FROM crm_roles WHERE id = :role_id"),
                    {"role_id": old_role_id},
                ).one()
                downgraded_user = connection.execute(
                    text("SELECT token_version FROM crm_users WHERE id = :user_id"),
                    {"user_id": standard_user_id},
                ).scalar_one()
                downgraded_session = connection.execute(
                    text("SELECT revoked_at FROM crm_user_sessions WHERE id = :session_id"),
                    {"session_id": old_standard_tokens["session_id"]},
                ).scalar_one()
            self.assertEqual(downgraded_role, (old_role_id, "employee"))
            self.assertEqual(downgraded_user, old_token_version + 1)
            self.assertIsNotNone(downgraded_session)

            command.upgrade(config, CURRENT_REVISION)
            with self.engine.connect() as connection:
                reupgraded_role = connection.execute(
                    text("SELECT id, code FROM crm_roles WHERE id = :role_id"),
                    {"role_id": old_role_id},
                ).one()
                reupgraded_user_version = connection.execute(
                    text("SELECT token_version FROM crm_users WHERE id = :user_id"),
                    {"user_id": standard_user_id},
                ).scalar_one()
            self.assertEqual(reupgraded_role, (old_role_id, "standard_user"))
            self.assertEqual(reupgraded_user_version, old_token_version + 2)

            session = self.SessionLocal()
            try:
                first = [role.code for role in UserService(session).ensure_default_roles()]
                second = [role.code for role in UserService(session).ensure_default_roles()]
                all_codes = list(session.scalars(select(CrmRole.code).order_by(CrmRole.code)))
            finally:
                session.close()
            self.assertEqual(sorted(first), ["admin", "standard_user"])
            self.assertEqual(sorted(second), ["admin", "standard_user"])
            self.assertEqual(all_codes, ["admin", "standard_user"])

            new_tokens = self.login(
                client,
                "migration-standard-user",
                "migration-standard-user-pass",
            )
            new_access_payload = get_session_token_service().verify_access_token(
                str(new_tokens["access_token"])
            )
            self.assertEqual(new_access_payload["role"], "standard_user")
            new_me = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
            )
            self.assertEqual(new_me.status_code, 200, new_me.text)
            self.assertEqual(new_me.json()["user"]["role_code"], "standard_user")
            refreshed = client.post(
                "/api/auth/refresh",
                json={"refresh_token": new_tokens["refresh_token"]},
            )
            self.assertEqual(refreshed.status_code, 200, refreshed.text)

    def test_upgrade_fails_before_mutation_when_target_role_exists(self) -> None:
        config = self.make_config()
        command.upgrade(config, PREVIOUS_REVISION)
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO crm_roles (code, name, created_at, updated_at)
                    VALUES ('standard_user', 'Conflicting Standard User', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """
                )
            )

        with self.assertRaisesRegex(RuntimeError, "target role already exists"):
            command.upgrade(config, CURRENT_REVISION)

        with self.engine.connect() as connection:
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            role_codes = set(connection.execute(text("SELECT code FROM crm_roles")).scalars())
        self.assertEqual(version, PREVIOUS_REVISION)
        self.assertTrue({"admin", "employee", "standard_user"}.issubset(role_codes))

    def test_upgrade_fails_when_source_role_is_missing(self) -> None:
        config = self.make_config()
        command.upgrade(config, PREVIOUS_REVISION)
        with self.engine.begin() as connection:
            connection.execute(text("DELETE FROM crm_roles WHERE code = 'employee'"))

        with self.assertRaisesRegex(RuntimeError, "source role does not exist"):
            command.upgrade(config, CURRENT_REVISION)

        with self.engine.connect() as connection:
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            role_codes = set(connection.execute(text("SELECT code FROM crm_roles")).scalars())
        self.assertEqual(version, PREVIOUS_REVISION)
        self.assertEqual(role_codes, {"admin"})


if __name__ == "__main__":
    unittest.main()
