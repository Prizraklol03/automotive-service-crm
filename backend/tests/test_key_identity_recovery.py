from __future__ import annotations

import ast
import base64
import importlib.util
import json
import logging
import os
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, inspect, select, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.core.config as config_module  # noqa: E402
import app.core.crypto as crypto_module  # noqa: E402
import app.crm.services.settings_service as settings_service_module  # noqa: E402
from app.api.deps import get_db  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.crypto import (  # noqa: E402
    AeadEncryptionService,
    KeyDescriptor,
    get_blind_index_service,
    get_data_encryption_service,
    get_file_encryption_service,
)
from app.core.key_identity import (  # noqa: E402
    BLIND_INDEX_IDENTITY_SETTING,
    DATA_ENCRYPTION_IDENTITY_SETTING,
    record_configured_key_identities,
    validate_runtime_key_identities,
)
from app.core.privacy import (  # noqa: E402
    hash_phone_fragment_lookup_candidates,
    hash_plate_fragment_lookup_candidates,
)
from app.crm.api.routers import crm_api_router  # noqa: E402
from app.crm.api.routers import settings as settings_router  # noqa: E402
from app.crm.models.audit_log import CrmAuditLog  # noqa: E402
from app.crm.models.setting import CrmSetting  # noqa: E402,F401
from app.crm.services.settings_service import SettingsService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import (  # noqa: E402
    create_empty_database_handle,
    create_schema_harness,
)

DATA_KEY_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
DATA_KEY_B = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="
HASH_KEY_A = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI="
HASH_KEY_B = "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM="
FILE_KEY = "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ="
SYNTHETIC_GENERATOR_PATH = (
    BACKEND_ROOT.parent / "scripts" / "seed" / "generate_synthetic_postgres_dump.py"
)
FRONTEND_SETTINGS_API_PATH = (
    BACKEND_ROOT.parent / "desktop" / "src" / "entities" / "settings" / "api" / "settings-api.ts"
)


def _clear_crypto_caches() -> None:
    get_settings.cache_clear()
    get_data_encryption_service.cache_clear()
    get_file_encryption_service.cache_clear()
    get_blind_index_service.cache_clear()


def _configure_synthetic_keys(
    monkeypatch: pytest.MonkeyPatch,
    *,
    data_key: str = DATA_KEY_A,
    data_key_id: str = "v1",
    hash_key: str = HASH_KEY_A,
    database_url: str | None = None,
) -> None:
    monkeypatch.setattr(config_module, "get_env_file", lambda: None)
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("CRM_DATA_ENCRYPTION_KEY", data_key)
    monkeypatch.setenv("CRM_DATA_ENCRYPTION_KEY_ID", data_key_id)
    monkeypatch.setenv("CRM_DATA_HASH_KEY", hash_key)
    monkeypatch.setenv("CRM_FILE_ENCRYPTION_KEY", FILE_KEY)
    monkeypatch.setenv("CRM_FILE_ENCRYPTION_KEY_ID", "v1")
    monkeypatch.setenv("CRM_INSECURE_HTTP_ALLOWED", "true")
    if database_url is not None:
        monkeypatch.setenv("DATABASE_URL", database_url)
    _clear_crypto_caches()


def _stored_identities(connection) -> dict[str, str]:
    return dict(
        connection.execute(
            text(
                "SELECT key, value FROM crm_settings "
                "WHERE key IN (:data_key, :hash_key) ORDER BY key"
            ),
            {
                "data_key": DATA_ENCRYPTION_IDENTITY_SETTING,
                "hash_key": BLIND_INDEX_IDENTITY_SETTING,
            },
        ).all()
    )


@pytest.fixture(autouse=True)
def clear_crypto_caches_after_test():
    yield
    _clear_crypto_caches()


def _make_alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_first_registration_and_repeated_startup_accept_same_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_synthetic_keys(monkeypatch)
    harness = create_schema_harness(metadata=Base.metadata)
    try:
        with harness.engine.begin() as connection:
            record_configured_key_identities(connection)
            record_configured_key_identities(connection)
        with harness.engine.connect() as connection:
            validate_runtime_key_identities(connection, app_env="staging")
            validate_runtime_key_identities(connection, app_env="production")
            stored = dict(
                connection.execute(
                    text(
                        "SELECT key, value FROM crm_settings "
                        "WHERE key IN (:data_key, :hash_key) ORDER BY key"
                    ),
                    {
                        "data_key": DATA_ENCRYPTION_IDENTITY_SETTING,
                        "hash_key": BLIND_INDEX_IDENTITY_SETTING,
                    },
                ).all()
            )
        assert set(stored) == {DATA_ENCRYPTION_IDENTITY_SETTING, BLIND_INDEX_IDENTITY_SETTING}
        assert DATA_KEY_A not in "".join(stored.values())
        assert HASH_KEY_A not in "".join(stored.values())
    finally:
        harness.close()


@pytest.mark.parametrize(
    ("identity", "expected_variable"),
    [
        ("data-encryption", "CRM_DATA_ENCRYPTION_KEY"),
        ("blind-index", "CRM_DATA_HASH_KEY"),
    ],
)
def test_changed_key_id_is_rejected_without_replacing_identity(
    monkeypatch: pytest.MonkeyPatch,
    identity: str,
    expected_variable: str,
) -> None:
    _configure_synthetic_keys(monkeypatch)
    harness = create_schema_harness(metadata=Base.metadata)
    try:
        with harness.engine.begin() as connection:
            record_configured_key_identities(connection)
            stored_before = _stored_identities(connection)

        if identity == "data-encryption":
            _configure_synthetic_keys(monkeypatch, data_key_id="v2")
        else:
            monkeypatch.setattr(crypto_module, "_BLIND_INDEX_KEY_ID", "v2")
            _clear_crypto_caches()
        with harness.engine.connect() as connection, pytest.raises(RuntimeError) as error:
            validate_runtime_key_identities(connection, app_env="production")

        assert expected_variable in str(error.value)
        assert DATA_KEY_A not in str(error.value)
        with harness.engine.connect() as connection:
            assert _stored_identities(connection) == stored_before
    finally:
        harness.close()


@pytest.mark.parametrize(
    ("changed_field", "changed_value", "expected_variable"),
    [
        ("data_key", DATA_KEY_B, "CRM_DATA_ENCRYPTION_KEY"),
        ("hash_key", HASH_KEY_B, "CRM_DATA_HASH_KEY"),
    ],
)
def test_changed_key_material_fails_without_secret_leakage(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    changed_field: str,
    changed_value: str,
    expected_variable: str,
) -> None:
    _configure_synthetic_keys(monkeypatch)
    harness = create_schema_harness(metadata=Base.metadata)
    try:
        with harness.engine.begin() as connection:
            record_configured_key_identities(connection)

        keys = {"data_key": DATA_KEY_A, "hash_key": HASH_KEY_A, changed_field: changed_value}
        _configure_synthetic_keys(monkeypatch, data_key=keys["data_key"], hash_key=keys["hash_key"])
        caplog.set_level(logging.DEBUG)
        with harness.engine.connect() as connection, pytest.raises(RuntimeError) as error:
            validate_runtime_key_identities(connection, app_env="production")

        combined_output = f"{error.value}\n{caplog.text}"
        assert expected_variable in str(error.value)
        for secret in (DATA_KEY_A, DATA_KEY_B, HASH_KEY_A, HASH_KEY_B, FILE_KEY):
            assert secret not in combined_output
    finally:
        harness.close()


def test_missing_identity_fails_closed_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_synthetic_keys(monkeypatch)
    harness = create_schema_harness(metadata=Base.metadata)
    try:
        with harness.engine.begin() as connection:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(64) NOT NULL)"))
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('0055_security_hardening')")
            )
        with harness.engine.connect() as connection, pytest.raises(
            RuntimeError,
            match="identity is missing",
        ) as error:
            validate_runtime_key_identities(connection, app_env="production")
        assert DATA_KEY_A not in str(error.value)
        with harness.engine.connect() as connection:
            assert _stored_identities(connection) == {}
    finally:
        harness.close()


def test_settings_bootstrap_does_not_overwrite_key_identities(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_synthetic_keys(monkeypatch)
    harness = create_schema_harness(metadata=Base.metadata)
    try:
        with harness.engine.begin() as connection:
            record_configured_key_identities(connection)
            stored_before = _stored_identities(connection)

        with harness.SessionLocal() as session:
            SettingsService(session).ensure_defaults()
            SettingsService(session).ensure_defaults()

        with harness.engine.connect() as connection:
            assert _stored_identities(connection) == stored_before
            keys = set(connection.execute(text("SELECT key FROM crm_settings")).scalars())
        assert keys == {
            BLIND_INDEX_IDENTITY_SETTING,
            DATA_ENCRYPTION_IDENTITY_SETTING,
            SettingsService.MODULES_CONFIG_KEY,
            SettingsService.VISUAL_CONFIG_KEY,
        }
    finally:
        harness.close()


def test_key_identities_are_isolated_from_settings_api_and_audit(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _configure_synthetic_keys(monkeypatch)
    monkeypatch.setattr(
        settings_service_module,
        "get_document_templates_dir",
        lambda: Path("synthetic/templates"),
    )
    monkeypatch.setattr(
        settings_service_module,
        "get_generated_documents_dir",
        lambda: Path("synthetic/generated"),
    )
    harness = create_schema_harness(metadata=Base.metadata)
    try:
        with harness.engine.begin() as connection:
            record_configured_key_identities(connection)
            stored_before = _stored_identities(connection)

        app = FastAPI()
        app.include_router(settings_router.router, prefix="/api/settings")

        def override_get_db():
            with harness.SessionLocal() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        for route in app.routes:
            if not isinstance(route, APIRoute):
                continue
            for dependency in route.dependant.dependencies:
                if dependency.call is not get_db:
                    app.dependency_overrides[dependency.call] = lambda: object()

        caplog.set_level(logging.DEBUG)
        with TestClient(app) as client:
            settings_response = client.get("/api/settings")
            modules_response = client.get("/api/settings/modules")
            modules_payload = modules_response.json()
            modules_payload[DATA_ENCRYPTION_IDENTITY_SETTING] = "attempted-overwrite"
            modules_payload[BLIND_INDEX_IDENTITY_SETTING] = "attempted-overwrite"
            modules_update_response = client.put("/api/settings/modules", json=modules_payload)
            create_response = client.post(
                "/api/settings",
                json={"key": DATA_ENCRYPTION_IDENTITY_SETTING, "value": "attempted-create"},
            )
            update_response = client.put(
                f"/api/settings/{DATA_ENCRYPTION_IDENTITY_SETTING}",
                json={"value": "attempted-update"},
            )
            delete_response = client.delete(f"/api/settings/{DATA_ENCRYPTION_IDENTITY_SETTING}")

        assert settings_response.status_code == 200
        assert modules_response.status_code == 200
        assert modules_update_response.status_code == 200
        assert create_response.status_code in {404, 405}
        assert update_response.status_code in {404, 405}
        assert delete_response.status_code in {404, 405}

        response_output = "\n".join(
            response.text
            for response in (
                settings_response,
                modules_response,
                modules_update_response,
                create_response,
                update_response,
                delete_response,
            )
        )
        with harness.engine.connect() as connection:
            stored_after = _stored_identities(connection)
            audit_count = connection.scalar(select(func.count()).select_from(CrmAuditLog))

        assert stored_after == stored_before
        assert audit_count == 0
        for marker_name, marker_value in stored_before.items():
            fingerprint = json.loads(marker_value)["verifier"]
            assert marker_name not in response_output
            assert marker_value not in response_output
            assert fingerprint not in response_output
            assert marker_value not in caplog.text
            assert fingerprint not in caplog.text
    finally:
        harness.close()


def test_settings_routes_frontend_and_synthetic_export_do_not_expose_key_identities() -> None:
    settings_paths = {
        route.path
        for route in crm_api_router.routes
        if isinstance(route, APIRoute) and route.path.startswith("/settings")
    }
    direct_dynamic_paths = {
        path
        for path in settings_paths
        if path.count("/") == 2 and path.rsplit("/", 1)[-1].startswith("{")
    }
    assert direct_dynamic_paths == set()

    frontend_source = FRONTEND_SETTINGS_API_PATH.read_text(encoding="utf-8")
    assert DATA_ENCRYPTION_IDENTITY_SETTING not in frontend_source
    assert BLIND_INDEX_IDENTITY_SETTING not in frontend_source

    spec = importlib.util.spec_from_file_location(
        "key_identity_synthetic_export",
        SYNTHETIC_GENERATOR_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        exported_keys = {row["key"] for row in module.SyntheticBuilder._build_settings(object())}
    finally:
        sys.modules.pop(spec.name, None)
    assert exported_keys == {SettingsService.MODULES_CONFIG_KEY, SettingsService.VISUAL_CONFIG_KEY}


@pytest.mark.parametrize("app_env", ["development", "dev", "test", "testing"])
def test_local_and_test_modes_do_not_require_persistent_identity(app_env: str) -> None:
    validate_runtime_key_identities(None, app_env=app_env)


def test_0055_records_identities_and_0056_rolls_back_corrupt_backfill(monkeypatch: pytest.MonkeyPatch) -> None:
    database_handle = create_empty_database_handle()
    engine = create_engine(database_handle.database_url, future=True, pool_pre_ping=True)
    try:
        _configure_synthetic_keys(monkeypatch, database_url=database_handle.database_url)
        alembic_config = _make_alembic_config(database_handle.database_url)
        command.upgrade(alembic_config, "0054_external_leads_api")

        with engine.begin() as connection:
            for suffix in ("01", "02"):
                connection.execute(
                    text(
                        """
                        INSERT INTO crm_clients (
                            full_name, phone_display, phone_normalized, telegram_username, comment,
                            is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            :full_name, :phone, :phone, NULL, NULL,
                            FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        """
                    ),
                    {
                        "full_name": f"Synthetic Client {suffix}",
                        "phone": f"+799900000{suffix}",
                    },
                )

        command.upgrade(alembic_config, "0055_security_hardening")
        with engine.connect() as connection:
            persisted_keys = set(
                connection.execute(
                    text(
                        "SELECT key FROM crm_settings "
                        "WHERE key IN (:data_key, :hash_key)"
                    ),
                    {
                        "data_key": DATA_ENCRYPTION_IDENTITY_SETTING,
                        "hash_key": BLIND_INDEX_IDENTITY_SETTING,
                    },
                ).scalars()
            )
            validate_runtime_key_identities(connection, app_env="staging")
        assert persisted_keys == {DATA_ENCRYPTION_IDENTITY_SETTING, BLIND_INDEX_IDENTITY_SETTING}

        corrupting_service = AeadEncryptionService(
            scope="data",
            key=KeyDescriptor(
                key_id="v1",
                key_bytes=base64.urlsafe_b64decode(DATA_KEY_B),
            ),
        )
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE crm_clients SET full_name = :value "
                    "WHERE id = (SELECT max(id) FROM crm_clients)"
                ),
                {"value": corrupting_service.encrypt("Synthetic Corrupt Client")},
            )

        with pytest.raises(RuntimeError, match="migration aborted") as error:
            command.upgrade(alembic_config, "0056_client_name_blind_tokens")
        assert "Synthetic Corrupt Client" not in str(error.value)
        assert DATA_KEY_A not in str(error.value)
        assert DATA_KEY_B not in str(error.value)

        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        client_columns = {column["name"] for column in inspect(engine).get_columns("crm_clients")}
        assert revision == "0055_security_hardening"
        assert "name_search_hashes" not in client_columns
    finally:
        engine.dispose()
        database_handle.close()


def test_populated_0058_database_upgrades_to_0059_with_stable_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    database_handle = create_empty_database_handle()
    engine = create_engine(database_handle.database_url, future=True, pool_pre_ping=True)
    try:
        _configure_synthetic_keys(monkeypatch, database_url=database_handle.database_url)
        alembic_config = _make_alembic_config(database_handle.database_url)
        command.upgrade(alembic_config, "0054_external_leads_api")

        with engine.begin() as connection:
            client_id = connection.execute(
                text(
                    """
                    INSERT INTO crm_clients (
                        full_name, phone_display, phone_normalized, telegram_username, comment,
                        is_deleted, deleted_at, created_at, updated_at
                    ) VALUES (
                        'Synthetic Existing Client', '+70000000027', '+70000000027', NULL, 'Synthetic note',
                        FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING id
                    """
                )
            ).scalar_one()

        command.upgrade(alembic_config, "0058_order_payment_idempotency")
        with engine.connect() as connection:
            revision_before_0059 = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        assert revision_before_0059 == "0058_order_payment_idempotency"

        command.upgrade(alembic_config, "0059_client_phone_fragment_hashes")

        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT full_name, name_search_hashes, phone_fragment_hashes "
                    "FROM crm_clients WHERE id = :id"
                ),
                {"id": client_id},
            ).one()
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            validate_runtime_key_identities(connection, app_env="production")

        assert revision == "0059_client_phone_fragment_hashes"
        assert row.full_name != "Synthetic Existing Client"
        assert get_data_encryption_service().decrypt(row.full_name) == "Synthetic Existing Client"
        assert row.name_search_hashes
        assert set(row.phone_fragment_hashes).intersection(hash_phone_fragment_lookup_candidates("0077"))
    finally:
        engine.dispose()
        database_handle.close()


@pytest.mark.parametrize("identity_failure", ["mismatched", "missing"])
def test_0059_rejects_invalid_hash_key_identity_before_ddl(
    monkeypatch: pytest.MonkeyPatch,
    identity_failure: str,
) -> None:
    database_handle = create_empty_database_handle()
    engine = create_engine(database_handle.database_url, future=True, pool_pre_ping=True)
    try:
        _configure_synthetic_keys(monkeypatch, database_url=database_handle.database_url)
        alembic_config = _make_alembic_config(database_handle.database_url)
        command.upgrade(alembic_config, "0058_order_payment_idempotency")

        if identity_failure == "mismatched":
            _configure_synthetic_keys(
                monkeypatch,
                hash_key=HASH_KEY_B,
                database_url=database_handle.database_url,
            )
        else:
            with engine.begin() as connection:
                connection.execute(
                    text("DELETE FROM crm_settings WHERE key = :key"),
                    {"key": BLIND_INDEX_IDENTITY_SETTING},
                )

        with pytest.raises(RuntimeError, match="CRM_DATA_HASH_KEY") as error:
            command.upgrade(alembic_config, "0059_client_phone_fragment_hashes")

        error_text = str(error.value)
        for secret in (HASH_KEY_A, HASH_KEY_B, DATA_KEY_A, FILE_KEY):
            assert secret not in error_text
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        client_columns = {column["name"] for column in inspect(engine).get_columns("crm_clients")}
        assert revision == "0058_order_payment_idempotency"
        assert "phone_fragment_hashes" not in client_columns
    finally:
        engine.dispose()
        database_handle.close()


def test_populated_0059_database_upgrades_to_0060_with_plate_fragment_backfill(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_handle = create_empty_database_handle()
    engine = create_engine(database_handle.database_url, future=True, pool_pre_ping=True)
    try:
        _configure_synthetic_keys(monkeypatch, database_url=database_handle.database_url)
        alembic_config = _make_alembic_config(database_handle.database_url)
        command.upgrade(alembic_config, "0054_external_leads_api")

        with engine.begin() as connection:
            client_id = connection.execute(
                text(
                    """
                    INSERT INTO crm_clients (
                        full_name, phone_display, phone_normalized, telegram_username, comment,
                        is_deleted, deleted_at, created_at, updated_at
                    ) VALUES (
                        'Synthetic Plate Client', '+70000000028', '+70000000028', NULL, NULL,
                        FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING id
                    """
                )
            ).scalar_one()
            vehicle_id = connection.execute(
                text(
                    """
                    INSERT INTO crm_vehicles (
                        client_id, plate_number_display, plate_number_normalized, vin,
                        brand_id, model_id, brand, model, year, mileage, color, comment,
                        is_deleted, deleted_at, created_at, updated_at
                    ) VALUES (
                        :client_id, 'T002ST124', 'T002ST124', NULL,
                        NULL, NULL, 'Mazda', 'CX-5', 2024, 1000, NULL, NULL,
                        FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING id
                    """
                ),
                {"client_id": client_id},
            ).scalar_one()

        command.upgrade(alembic_config, "0059_client_phone_fragment_hashes")
        with engine.connect() as connection:
            revision_before_0060 = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        assert revision_before_0060 == "0059_client_phone_fragment_hashes"

        command.upgrade(alembic_config, "0060_vehicle_plate_fragment_hashes")

        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT plate_number_display, plate_number_normalized, plate_fragment_hashes "
                    "FROM crm_vehicles WHERE id = :id"
                ),
                {"id": vehicle_id},
            ).one()
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

        assert revision == "0060_vehicle_plate_fragment_hashes"
        assert row.plate_number_display != "T002ST124"
        assert row.plate_number_normalized == "T002ST124"
        assert set(row.plate_fragment_hashes).intersection(hash_plate_fragment_lookup_candidates("ST12"))
        assert "ST12" not in row.plate_fragment_hashes
    finally:
        engine.dispose()
        database_handle.close()


@pytest.mark.parametrize("identity_failure", ["mismatched", "missing"])
def test_0060_rejects_invalid_hash_key_identity_before_ddl(
    monkeypatch: pytest.MonkeyPatch,
    identity_failure: str,
) -> None:
    database_handle = create_empty_database_handle()
    engine = create_engine(database_handle.database_url, future=True, pool_pre_ping=True)
    try:
        _configure_synthetic_keys(monkeypatch, database_url=database_handle.database_url)
        alembic_config = _make_alembic_config(database_handle.database_url)
        command.upgrade(alembic_config, "0059_client_phone_fragment_hashes")

        if identity_failure == "mismatched":
            _configure_synthetic_keys(
                monkeypatch,
                hash_key=HASH_KEY_B,
                database_url=database_handle.database_url,
            )
        else:
            with engine.begin() as connection:
                connection.execute(
                    text("DELETE FROM crm_settings WHERE key = :key"),
                    {"key": BLIND_INDEX_IDENTITY_SETTING},
                )

        with pytest.raises(RuntimeError, match="CRM_DATA_HASH_KEY") as error:
            command.upgrade(alembic_config, "0060_vehicle_plate_fragment_hashes")

        error_text = str(error.value)
        for secret in (HASH_KEY_A, HASH_KEY_B, DATA_KEY_A, FILE_KEY):
            assert secret not in error_text
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        vehicle_columns = {column["name"] for column in inspect(engine).get_columns("crm_vehicles")}
        assert revision == "0059_client_phone_fragment_hashes"
        assert "plate_fragment_hashes" not in vehicle_columns
    finally:
        engine.dispose()
        database_handle.close()


def test_0055_downgrade_is_explicitly_irreversible() -> None:
    migration_path = BACKEND_ROOT / "alembic" / "versions" / "0055_security_hardening.py"
    module = ast.parse(migration_path.read_text(encoding="utf-8"))
    downgrade = next(
        node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == "downgrade"
    )
    assert len(downgrade.body) == 1
    statement = downgrade.body[0]
    assert isinstance(statement, ast.Raise)
    assert isinstance(statement.exc, ast.Call)
    assert isinstance(statement.exc.func, ast.Name)
    assert statement.exc.func.id == "RuntimeError"
    message = ast.literal_eval(statement.exc.args[0])
    assert "irreversible" in message
    assert "restore" in message
