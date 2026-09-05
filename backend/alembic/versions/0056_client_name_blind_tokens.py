"""client name blind tokens

Revision ID: 0056_client_name_blind_tokens
Revises: 0055_security_hardening
Create Date: 2026-07-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.crypto import get_data_encryption_service
from app.core.key_identity import validate_configured_key_identities
from app.core.privacy import hash_name_lookup_tokens

revision = "0056_client_name_blind_tokens"
down_revision = "0055_security_hardening"
branch_labels = None
depends_on = None


def _decrypt_if_needed(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return get_data_encryption_service().decrypt(value)
    except Exception as exc:
        raise RuntimeError("0056 client-name backfill could not decrypt an encrypted value; migration aborted") from exc


def upgrade() -> None:
    validate_configured_key_identities(op.get_bind())

    op.add_column("crm_clients", sa.Column("name_search_hashes", postgresql.ARRAY(sa.String(length=64)), nullable=True))
    op.create_index(
        "ix_crm_clients_name_search_hashes",
        "crm_clients",
        ["name_search_hashes"],
        unique=False,
        postgresql_using="gin",
    )

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, full_name, company_name FROM crm_clients")).mappings().all()
    for row in rows:
        search_hashes = hash_name_lookup_tokens(_decrypt_if_needed(row["full_name"]), row["company_name"])
        bind.execute(
            sa.text("UPDATE crm_clients SET name_search_hashes = :name_search_hashes WHERE id = :id"),
            {"id": row["id"], "name_search_hashes": search_hashes or None},
        )


def downgrade() -> None:
    op.drop_index("ix_crm_clients_name_search_hashes", table_name="crm_clients")
    op.drop_column("crm_clients", "name_search_hashes")
