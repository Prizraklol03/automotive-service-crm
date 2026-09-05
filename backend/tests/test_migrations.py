from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings  # noqa: E402
from app.crm import models as crm_models  # noqa: E402
from app.db.alembic_versioning import ALEMBIC_VERSION_NUM_LENGTH  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_empty_database_handle  # noqa: E402


class AlembicMigrationTestCase(unittest.TestCase):
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

    def make_engine(self):
        return create_engine(self.database_handle.database_url, future=True, pool_pre_ping=True)

    def test_alembic_has_single_head(self) -> None:
        script = ScriptDirectory.from_config(self.make_config())
        self.assertEqual(tuple(script.get_heads()), ("0060_vehicle_plate_fragment_hashes",))

    def test_fresh_database_upgrades_to_head_on_postgresql(self) -> None:
        config = self.make_config()
        command.upgrade(config, "head")

        engine = self.make_engine()
        try:
            inspector = inspect(engine)
            with engine.connect() as connection:
                version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            self.assertEqual(version, "0060_vehicle_plate_fragment_hashes")

            existing_tables = set(inspector.get_table_names())
            self.assertTrue(
                {
                    "crm_vehicles",
                    "crm_orders",
                    "crm_car_brands",
                    "crm_car_models",
                    "crm_user_sessions",
                    "crm_user_preferences",
                    "crm_vehicle_owner_history",
                    "crm_finance_expense_attachments",
                    "crm_integration_sources",
                    "crm_external_lead_submissions",
                    "crm_external_lead_payload_logs",
                    "crm_material_attachments",
                    "crm_order_payment_idempotency",
                }.issubset(existing_tables)
            )
            legacy_tables = {
                "activity_logs",
                "app_settings",
                "cars",
                "clients",
                "employees",
                "order_employees",
                "order_services",
                "orders",
                "payments",
                "services",
                "service_categories",
            }
            self.assertTrue(existing_tables.isdisjoint(legacy_tables), existing_tables & legacy_tables)

            vehicle_fk_tables = {fk["referred_table"] for fk in inspector.get_foreign_keys("crm_vehicles")}
            self.assertIn("crm_car_brands", vehicle_fk_tables)
            self.assertIn("crm_car_models", vehicle_fk_tables)

            order_columns = {column["name"] for column in inspector.get_columns("crm_orders")}
            self.assertIn("scheduled_for", order_columns)
            self.assertIn("handover_at", order_columns)
            self.assertIn("discount_value", order_columns)
            self.assertIn("discount_type", order_columns)
            self.assertIn("photo_share_expires_at", order_columns)
            self.assertIn("photo_share_revoked_at", order_columns)
            self.assertNotIn("discount_rub", order_columns)
            self.assertNotIn("profit", order_columns)

            client_columns = {column["name"] for column in inspector.get_columns("crm_clients")}
            client_indexes = {index["name"] for index in inspector.get_indexes("crm_clients")}
            vehicle_columns = {column["name"] for column in inspector.get_columns("crm_vehicles")}
            vehicle_indexes = {index["name"] for index in inspector.get_indexes("crm_vehicles")}
            session_columns = {column["name"] for column in inspector.get_columns("crm_user_sessions")}
            audit_columns = {column["name"] for column in inspector.get_columns("crm_audit_logs")}
            payment_idempotency_columns = {
                column["name"]: column for column in inspector.get_columns("crm_order_payment_idempotency")
            }
            payment_idempotency_fks = inspector.get_foreign_keys("crm_order_payment_idempotency")
            self.assertIn("phone_search_hash", client_columns)
            self.assertIn("phone_fragment_hashes", client_columns)
            self.assertIn("name_search_hashes", client_columns)
            self.assertIn("ix_crm_clients_phone_fragment_hashes", client_indexes)
            self.assertIn("plate_search_hash", vehicle_columns)
            self.assertIn("plate_fragment_hashes", vehicle_columns)
            self.assertIn("ix_crm_vehicles_plate_fragment_hashes", vehicle_indexes)
            self.assertIn("vin_search_hash", vehicle_columns)
            self.assertIn("user_agent_hash", session_columns)
            self.assertIn("ip_prefix", session_columns)
            self.assertIn("metadata_json", audit_columns)
            self.assertTrue(payment_idempotency_columns["payment_id"]["nullable"])
            payment_fk = next(
                fk for fk in payment_idempotency_fks if fk["constrained_columns"] == ["payment_id"]
            )
            self.assertEqual(payment_fk["referred_table"], "crm_order_payments")
            self.assertEqual(payment_fk["options"].get("ondelete"), "SET NULL")
        finally:
            engine.dispose()

    def test_upgrade_0054_creates_external_lead_tables(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0054_external_leads_api")

        engine = self.make_engine()
        try:
            inspector = inspect(engine)
            source_columns = {column["name"] for column in inspector.get_columns("crm_integration_sources")}
            lead_columns = {column["name"] for column in inspector.get_columns("crm_external_lead_submissions")}
            log_columns = {column["name"] for column in inspector.get_columns("crm_external_lead_payload_logs")}
            lead_indexes = {index["name"] for index in inspector.get_indexes("crm_external_lead_submissions")}

            self.assertTrue({"api_key_hash", "allowed_domains", "last_used_at"}.issubset(source_columns))
            self.assertTrue({"phone_normalized", "dedupe_status", "raw_payload", "duplicate_count"}.issubset(lead_columns))
            self.assertTrue({"status", "error", "raw_payload"}.issubset(log_columns))
            self.assertIn("ix_crm_external_lead_submissions_dedupe_lookup", lead_indexes)
        finally:
            engine.dispose()

    def test_upgrade_0052_adds_client_type_and_payer_foreign_key(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0051_user_permissions")

        engine = self.make_engine()
        try:
            with engine.begin() as connection:
                client_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_clients (
                            full_name, phone_display, phone_normalized, telegram_username, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            'Legacy Client', '+70000000032', '+70000000032', NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    )
                ).scalar_one()

            command.upgrade(config, "0052_client_payer_document_foundation")

            with engine.connect() as connection:
                client_row = connection.execute(
                    text(
                        """
                        SELECT client_type, address, company_name, inn, kpp, ogrn, legal_address, actual_address
                        FROM crm_clients
                        WHERE id = :client_id
                        """
                    ),
                    {"client_id": client_id},
                ).one()
                client_columns = {column["name"] for column in inspect(connection).get_columns("crm_clients")}
                order_columns = {column["name"] for column in inspect(connection).get_columns("crm_orders")}
                order_indexes = inspect(connection).get_indexes("crm_orders")
                order_fks = {fk["constrained_columns"][0]: fk["referred_table"] for fk in inspect(connection).get_foreign_keys("crm_orders")}

            self.assertEqual(client_row[0], "individual")
            self.assertIsNone(client_row[1])
            self.assertIsNone(client_row[2])
            self.assertIsNone(client_row[3])
            self.assertIsNone(client_row[4])
            self.assertIsNone(client_row[5])
            self.assertIsNone(client_row[6])
            self.assertIsNone(client_row[7])
            self.assertTrue(
                {
                    "client_type",
                    "address",
                    "company_name",
                    "inn",
                    "kpp",
                    "ogrn",
                    "legal_address",
                    "actual_address",
                    "representative_full_name",
                    "representative_position",
                    "representative_basis",
                }.issubset(client_columns)
            )
            self.assertIn("payer_client_id", order_columns)
            self.assertTrue(any(index["column_names"] == ["payer_client_id"] for index in order_indexes))
            self.assertEqual(order_fks.get("payer_client_id"), "crm_clients")
        finally:
            engine.dispose()

    def test_upgrade_0044_migrates_deleted_reminder_status_to_expired(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0043_order_money_truth")

        engine = self.make_engine()
        try:
            with engine.begin() as connection:
                role_id = connection.execute(text("SELECT id FROM crm_roles ORDER BY id LIMIT 1")).scalar_one()
                connection.execute(
                    text(
                        """
                        INSERT INTO crm_users (
                            role_id, full_name, login, password_hash, token_version, is_active, created_at, updated_at
                        ) VALUES (
                            :role_id, 'Reminder Admin', 'reminder-admin', 'hash', 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        """
                    ),
                    {"role_id": role_id},
                )
                user_id = connection.execute(
                    text("SELECT id FROM crm_users WHERE login = 'reminder-admin'")
                ).scalar_one()
                reminder_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_reminders (
                            target_type, target_id, text, due_at, status, postpone_until, repeat_rule, completed_at,
                            created_by_user_id, created_at, updated_at
                        ) VALUES (
                            'client', 1, 'Legacy reminder', CURRENT_TIMESTAMP, 'deleted', NULL, NULL, NULL,
                            :user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    ),
                    {"user_id": user_id},
                ).scalar_one()

            command.upgrade(config, "0044_reminders_hard_delete_truth")

            with engine.connect() as connection:
                status = connection.execute(
                    text("SELECT status FROM crm_reminders WHERE id = :reminder_id"),
                    {"reminder_id": reminder_id},
                ).scalar_one()
            self.assertEqual(status, "expired")
        finally:
            engine.dispose()

    def test_upgrade_0045_backfills_document_number_to_order_id_and_removes_setting(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0044_reminders_hard_delete_truth")

        engine = self.make_engine()
        try:
            with engine.begin() as connection:
                role_id = connection.execute(text("SELECT id FROM crm_roles ORDER BY id LIMIT 1")).scalar_one()
                status_code = connection.execute(
                    text("SELECT code FROM crm_order_statuses ORDER BY sort_order LIMIT 1")
                ).scalar_one()
                connection.execute(
                    text(
                        """
                        INSERT INTO crm_users (
                            role_id, full_name, login, password_hash, token_version, is_active, created_at, updated_at
                        ) VALUES (
                            :role_id, 'Document Admin', 'document-admin', 'hash', 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        """
                    ),
                    {"role_id": role_id},
                )
                user_id = connection.execute(
                    text("SELECT id FROM crm_users WHERE login = 'document-admin'")
                ).scalar_one()
                client_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_clients (
                            full_name, phone_display, phone_normalized, telegram_username, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            'Demo Customer 03', '+70000000033', '+70000000033', NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    )
                ).scalar_one()
                vehicle_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_vehicles (
                            client_id, plate_number_display, plate_number_normalized, vin, brand_id, model_id, brand, model,
                            year, mileage, color, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            :client_id, 'A131CC00', 'A131CC00', NULL, NULL, NULL, 'Lada', 'Vesta',
                            2022, 10000, NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    ),
                    {"client_id": client_id},
                ).scalar_one()
                order_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_orders (
                            client_id, vehicle_id, status, completed_at, due_date, scheduled_for, handover_at, comment,
                            discount_value, discount_type, services_total, amount_to_pay, is_archived, photo_share_token, created_at, updated_at
                        ) VALUES (
                            :client_id, :vehicle_id, :status_code, NULL, NULL, NULL, NULL, NULL,
                            0, 'fixed', 1000, 1000, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    ),
                    {"client_id": client_id, "vehicle_id": vehicle_id, "status_code": status_code},
                ).scalar_one()
                template_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_document_templates (
                            code, name, storage_path, is_active, created_at, updated_at
                        ) VALUES (
                            'work_order', 'Заказ-наряд', '/templates/work-order.docx', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    )
                ).scalar_one()
                document_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_documents (
                            order_id, template_id, created_by_user_id, document_type, document_number, storage_docx_path,
                            storage_pdf_path, last_rendered_at, created_at, updated_at
                        ) VALUES (
                            :order_id, :template_id, :user_id, 'work_order', 999, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    ),
                    {"order_id": order_id, "template_id": template_id, "user_id": user_id},
                ).scalar_one()
                connection.execute(
                    text(
                        """
                        UPDATE crm_settings
                        SET value = '999', updated_at = CURRENT_TIMESTAMP
                        WHERE key = 'next_document_number'
                        """
                    )
                )

            command.upgrade(config, "0045_documents_order_id_truth")

            with engine.connect() as connection:
                document_number = connection.execute(
                    text("SELECT document_number FROM crm_documents WHERE id = :document_id"),
                    {"document_id": document_id},
                ).scalar_one()
                settings_row = connection.execute(
                    text("SELECT value FROM crm_settings WHERE key = 'next_document_number'")
                ).scalar_one_or_none()
            self.assertEqual(document_number, order_id)
            self.assertIsNone(settings_row)
        finally:
            engine.dispose()

    def test_upgrade_0046_reseeds_canonical_order_statuses_without_breaking_existing_canonical_orders(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0045_documents_order_id_truth")
        ready_display_name = "\u0413\u043e\u0442\u043e\u0432\u043e"

        engine = self.make_engine()
        try:
            with engine.begin() as connection:
                client_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_clients (
                            full_name, phone_display, phone_normalized, telegram_username, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            'Status Client', '+70000000034', '+70000000034', NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    )
                ).scalar_one()
                vehicle_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_vehicles (
                            client_id, plate_number_display, plate_number_normalized, vin, brand_id, model_id, brand, model,
                            year, mileage, color, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            :client_id, 'A141CC00', 'A141CC00', NULL, NULL, NULL, 'Lada', 'Vesta',
                            2022, 10000, NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    ),
                    {"client_id": client_id},
                ).scalar_one()

                connection.execute(
                    text(
                        """
                        INSERT INTO crm_order_statuses (code, display_name, status_group, color, sort_order, is_default)
                        VALUES ('done', :display_name, 'done', '#10b981', 30, FALSE)
                        ON CONFLICT (code) DO NOTHING
                        """
                    ),
                    {"display_name": ready_display_name},
                )

                for status_code in ("draft", "waiting", "postponed", "completed", "in_progress", "done", "cancelled"):
                    connection.execute(
                        text(
                            """
                            INSERT INTO crm_orders (
                                client_id, vehicle_id, status, completed_at, due_date, scheduled_for, handover_at, comment,
                                discount_value, discount_type, services_total, amount_to_pay, is_archived, photo_share_token, created_at, updated_at
                            ) VALUES (
                                :client_id, :vehicle_id, :status_code, NULL, NULL, NULL, NULL, NULL,
                                0, 'fixed', 1000, 1000, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                            )
                            """
                        ),
                        {"client_id": client_id, "vehicle_id": vehicle_id, "status_code": status_code},
                    )

            command.upgrade(config, "0046_canonical_order_statuses")

            with engine.connect() as connection:
                status_rows = connection.execute(
                    text(
                        """
                        SELECT code, status_group, sort_order, is_default
                        FROM crm_order_statuses
                        ORDER BY sort_order
                        """
                    )
                ).fetchall()
                order_statuses = connection.execute(
                    text("SELECT status FROM crm_orders ORDER BY id")
                ).scalars().all()

            self.assertEqual(
                status_rows,
                [
                    ("new", "new", 10, True),
                    ("in_progress", "in_progress", 20, False),
                    ("done", "done", 30, False),
                    ("closed", "closed", 40, False),
                    ("cancelled", "cancelled", 50, False),
                ],
            )
            self.assertEqual(order_statuses, ["new", "new", "in_progress", "closed", "in_progress", "done", "cancelled"])
        finally:
            engine.dispose()

    def test_upgrade_0046_preserves_customized_legacy_status_attributes_when_seeding_canonical_rows(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0045_documents_order_id_truth")
        accepted_display_name = "\u041f\u0440\u0438\u043d\u044f\u0442 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443"
        closed_display_name = "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d \u0438 \u0432\u044b\u0434\u0430\u043d"

        engine = self.make_engine()
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        UPDATE crm_order_statuses
                        SET display_name = :display_name,
                            color = '#112233',
                            sort_order = 11,
                            is_default = TRUE
                        WHERE code = 'draft'
                        """
                    ),
                    {"display_name": accepted_display_name},
                )
                connection.execute(
                    text(
                        """
                        UPDATE crm_order_statuses
                        SET display_name = :display_name,
                            color = '#445566',
                            sort_order = 41
                        WHERE code = 'completed'
                        """
                    ),
                    {"display_name": closed_display_name},
                )

            command.upgrade(config, "0046_canonical_order_statuses")

            with engine.connect() as connection:
                new_status = connection.execute(
                    text(
                        """
                        SELECT display_name, status_group, color, sort_order, is_default
                        FROM crm_order_statuses
                        WHERE code = 'new'
                        """
                    )
                ).one()
                closed_status = connection.execute(
                    text(
                        """
                        SELECT display_name, status_group, color, sort_order, is_default
                        FROM crm_order_statuses
                        WHERE code = 'closed'
                        """
                    )
                ).one()
                legacy_count = connection.execute(
                    text(
                        """
                        SELECT count(*)
                        FROM crm_order_statuses
                        WHERE code IN ('draft', 'waiting', 'postponed', 'completed')
                        """
                    )
                ).scalar_one()

            self.assertEqual(new_status, (accepted_display_name, "new", "#112233", 11, True))
            self.assertEqual(closed_status, (closed_display_name, "closed", "#445566", 41, False))
            self.assertEqual(legacy_count, 0)
        finally:
            engine.dispose()

    def test_upgrade_0048_backfills_vehicle_owner_history(self) -> None:
        config = self.make_config()
        command.upgrade(config, "0047_materials_journal")

        engine = self.make_engine()
        try:
            with engine.begin() as connection:
                client_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_clients (
                            full_name, phone_display, phone_normalized, telegram_username, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            'Owner Client', '+70000000035', '+70000000035', NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    )
                ).scalar_one()
                vehicle_id = connection.execute(
                    text(
                        """
                        INSERT INTO crm_vehicles (
                            client_id, plate_number_display, plate_number_normalized, vin, brand_id, model_id, brand, model,
                            year, mileage, color, comment, is_deleted, deleted_at, created_at, updated_at
                        ) VALUES (
                            :client_id, 'A151CC00', 'A151CC00', NULL, NULL, NULL, 'Lada', 'Vesta',
                            2022, 10000, NULL, NULL, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        )
                        RETURNING id
                        """
                    ),
                    {"client_id": client_id},
                ).scalar_one()

            command.upgrade(config, "0048_vehicle_owner_history")

            with engine.connect() as connection:
                owner_rows = connection.execute(
                    text(
                        """
                        SELECT vehicle_id, client_id, owned_to
                        FROM crm_vehicle_owner_history
                        WHERE vehicle_id = :vehicle_id
                        """
                    ),
                    {"vehicle_id": vehicle_id},
                ).fetchall()
            self.assertEqual(owner_rows, [(vehicle_id, client_id, None)])
        finally:
            engine.dispose()

    def test_metadata_contains_only_crm_tables(self) -> None:
        _ = crm_models
        table_names = set(Base.metadata.tables)
        self.assertIn("crm_users", table_names)
        self.assertIn("crm_user_sessions", table_names)
        legacy_tables = {
            "activity_logs",
            "app_settings",
            "cars",
            "clients",
            "employees",
            "order_employees",
            "order_services",
            "orders",
            "payments",
            "services",
            "service_categories",
        }
        self.assertTrue(table_names.isdisjoint(legacy_tables), table_names & legacy_tables)

    def test_revision_identifiers_fit_alembic_version_column(self) -> None:
        revision_ids: list[str] = []
        for path in sorted((BACKEND_ROOT / "alembic" / "versions").glob("*.py")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.startswith('revision = "'):
                    revision_ids.append(line.split('"')[1])
                    break

        self.assertTrue(revision_ids)
        self.assertLessEqual(max(len(revision_id) for revision_id in revision_ids), ALEMBIC_VERSION_NUM_LENGTH)

    def test_legacy_orm_archive_package_is_removed(self) -> None:
        self.assertFalse((BACKEND_ROOT / "app" / "models").exists())

    def test_dockerignore_excludes_python_bytecode_from_build_context(self) -> None:
        dockerignore = (BACKEND_ROOT.parent / ".dockerignore").read_text(encoding="utf-8")
        self.assertIn("**/__pycache__/", dockerignore)
        self.assertIn("**/*.pyc", dockerignore)


if __name__ == "__main__":
    unittest.main()
