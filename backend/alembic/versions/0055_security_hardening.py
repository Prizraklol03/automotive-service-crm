"""security hardening foundation

Revision ID: 0055_security_hardening
Revises: 0054_external_leads_api
Create Date: 2026-07-03
"""

from __future__ import annotations

import json
import sqlalchemy as sa
from alembic import op

from app.core.crypto import get_data_encryption_service
from app.core.key_identity import record_configured_key_identities
from app.core.privacy import hash_phone_lookup, hash_plate_lookup, hash_vin_lookup
from app.core.security import hash_user_agent, normalize_ip_prefix

revision = "0055_security_hardening"
down_revision = "0054_external_leads_api"
branch_labels = None
depends_on = None


def _encrypt_column_values(table_name: str, primary_key: str, columns: list[str]) -> None:
    bind = op.get_bind()
    encryption = get_data_encryption_service()
    rows = bind.execute(sa.text(f'SELECT {primary_key}, {", ".join(columns)} FROM {table_name}')).mappings().all()
    for row in rows:
        updates = {}
        for column in columns:
            value = row[column]
            if value is None:
                continue
            serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":")) if isinstance(value, (dict, list)) else str(value)
            updates[column] = encryption.encrypt(serialized)
        if not updates:
            continue
        assignments = ", ".join(f"{column} = :{column}" for column in updates)
        bind.execute(
            sa.text(f"UPDATE {table_name} SET {assignments} WHERE {primary_key} = :pk"),
            {"pk": row[primary_key], **updates},
        )


def _backfill_hashes() -> None:
    bind = op.get_bind()
    client_rows = bind.execute(sa.text("SELECT id, phone_normalized FROM crm_clients")).mappings().all()
    for row in client_rows:
        bind.execute(
            sa.text("UPDATE crm_clients SET phone_search_hash = :phone_search_hash WHERE id = :id"),
            {"id": row["id"], "phone_search_hash": hash_phone_lookup(row["phone_normalized"])},
        )

    vehicle_rows = bind.execute(sa.text("SELECT id, plate_number_normalized, vin FROM crm_vehicles")).mappings().all()
    for row in vehicle_rows:
        bind.execute(
            sa.text(
                """
                UPDATE crm_vehicles
                SET plate_search_hash = :plate_search_hash,
                    vin_search_hash = :vin_search_hash
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "plate_search_hash": hash_plate_lookup(row["plate_number_normalized"]),
                "vin_search_hash": hash_vin_lookup(row["vin"]),
            },
        )

    session_rows = bind.execute(sa.text("SELECT id, user_agent, ip_address, created_at, last_used_at FROM crm_user_sessions")).mappings().all()
    for row in session_rows:
        bind.execute(
            sa.text(
                """
                UPDATE crm_user_sessions
                SET user_agent_hash = :user_agent_hash,
                    ip_prefix = :ip_prefix,
                    last_seen_at = COALESCE(last_used_at, created_at)
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "user_agent_hash": hash_user_agent(row["user_agent"]),
                "ip_prefix": normalize_ip_prefix(row["ip_address"]),
            },
        )


def upgrade() -> None:
    record_configured_key_identities(op.get_bind())

    op.add_column("crm_clients", sa.Column("phone_search_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_crm_clients_phone_search_hash", "crm_clients", ["phone_search_hash"])
    op.alter_column("crm_clients", "full_name", type_=sa.Text(), existing_type=sa.String(length=255), existing_nullable=False)
    op.alter_column("crm_clients", "phone_display", type_=sa.Text(), existing_type=sa.String(length=32), existing_nullable=False)
    op.alter_column("crm_clients", "address", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("crm_clients", "legal_address", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("crm_clients", "actual_address", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("crm_clients", "representative_full_name", type_=sa.Text(), existing_type=sa.String(length=255), existing_nullable=True)
    op.alter_column("crm_clients", "representative_basis", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("crm_clients", "comment", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)

    op.add_column("crm_vehicles", sa.Column("plate_search_hash", sa.String(length=64), nullable=True))
    op.add_column("crm_vehicles", sa.Column("vin_search_hash", sa.String(length=64), nullable=True))
    op.add_column("crm_vehicles", sa.Column("body_number", sa.Text(), nullable=True))
    op.create_index("ix_crm_vehicles_plate_search_hash", "crm_vehicles", ["plate_search_hash"])
    op.create_index("ix_crm_vehicles_vin_search_hash", "crm_vehicles", ["vin_search_hash"])
    op.alter_column("crm_vehicles", "plate_number_display", type_=sa.Text(), existing_type=sa.String(length=32), existing_nullable=False)
    op.alter_column("crm_vehicles", "vin", type_=sa.Text(), existing_type=sa.String(length=32), existing_nullable=True)
    op.alter_column("crm_vehicles", "comment", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)

    op.add_column("crm_orders", sa.Column("photo_share_expires_at", sa.DateTime(timezone=False), nullable=True))
    op.add_column("crm_orders", sa.Column("photo_share_revoked_at", sa.DateTime(timezone=False), nullable=True))
    op.alter_column("crm_orders", "comment", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)

    op.alter_column("crm_order_field_values", "value", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("crm_notes", "comment", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=False)
    op.alter_column("crm_notes", "telephone", type_=sa.Text(), existing_type=sa.String(length=32), existing_nullable=True)
    op.alter_column("inspection_sessions", "general_comment", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("inspection_marks", "comment", type_=sa.Text(), existing_type=sa.Text(), existing_nullable=True)
    op.alter_column("inspection_exports", "snapshot_json", type_=sa.Text(), existing_type=sa.JSON(), existing_nullable=False)
    op.alter_column("inspection_exports", "export_payload_json", type_=sa.Text(), existing_type=sa.JSON(), existing_nullable=False)

    op.add_column("crm_user_sessions", sa.Column("user_agent_hash", sa.String(length=64), nullable=True))
    op.add_column("crm_user_sessions", sa.Column("ip_prefix", sa.String(length=128), nullable=True))
    op.add_column("crm_user_sessions", sa.Column("last_seen_at", sa.DateTime(timezone=False), nullable=True))
    op.create_index("ix_crm_user_sessions_user_agent_hash", "crm_user_sessions", ["user_agent_hash"])
    op.create_index("ix_crm_user_sessions_ip_prefix", "crm_user_sessions", ["ip_prefix"])

    op.alter_column("crm_audit_logs", "actor_user_id", nullable=True, existing_type=sa.Integer())
    op.add_column("crm_audit_logs", sa.Column("ip_prefix", sa.String(length=128), nullable=True))
    op.add_column("crm_audit_logs", sa.Column("user_agent_hash", sa.String(length=64), nullable=True))
    op.add_column("crm_audit_logs", sa.Column("metadata_json", sa.JSON(), nullable=True))

    _backfill_hashes()
    _encrypt_column_values("crm_clients", "id", ["full_name", "phone_display", "address", "legal_address", "actual_address", "representative_full_name", "representative_basis", "comment"])
    _encrypt_column_values("crm_vehicles", "id", ["plate_number_display", "vin", "comment"])
    _encrypt_column_values("crm_orders", "id", ["comment"])
    _encrypt_column_values("crm_notes", "id", ["comment", "telephone"])
    _encrypt_column_values("inspection_sessions", "id", ["general_comment"])
    _encrypt_column_values("inspection_marks", "id", ["comment"])
    _encrypt_column_values("inspection_exports", "id", ["snapshot_json", "export_payload_json"])
    bind = op.get_bind()
    encryption = get_data_encryption_service()
    rows = bind.execute(sa.text("SELECT order_id, field_key, value FROM crm_order_field_values")).mappings().all()
    for row in rows:
        if row["value"] is None:
            continue
        bind.execute(
            sa.text("UPDATE crm_order_field_values SET value = :value WHERE order_id = :order_id AND field_key = :field_key"),
            {
                "order_id": row["order_id"],
                "field_key": row["field_key"],
                "value": encryption.encrypt(str(row["value"])),
            },
        )

    op.alter_column("crm_user_sessions", "last_seen_at", nullable=False, existing_type=sa.DateTime(timezone=False))


def downgrade() -> None:
    raise RuntimeError(
        "0055_security_hardening is irreversible: encrypted values cannot be restored automatically; "
        "restore an approved pre-migration backup instead"
    )
