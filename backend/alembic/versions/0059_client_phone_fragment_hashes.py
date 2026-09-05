"""Add privacy-preserving client phone fragment hashes.

Revision ID: 0059_client_phone_fragment_hashes
Revises: 0058_order_payment_idempotency

The backfill derives blind indexes from the existing canonical
``phone_normalized`` value. It validates the configured key identity before
DDL so a missing or mismatched hash key aborts without a partial schema change.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.key_identity import validate_configured_key_identities
from app.core.privacy import hash_phone_search_fragments

revision = "0059_client_phone_fragment_hashes"
down_revision = "0058_order_payment_idempotency"
branch_labels = None
depends_on = None
BACKFILL_BATCH_SIZE = 500


def _backfill_phone_fragment_hashes(bind) -> None:
    last_client_id = 0
    while True:
        rows = bind.execute(
            sa.text(
                "SELECT id, phone_normalized FROM crm_clients "
                "WHERE id > :last_client_id ORDER BY id LIMIT :batch_size"
            ),
            {"last_client_id": last_client_id, "batch_size": BACKFILL_BATCH_SIZE},
        ).mappings().all()
        if not rows:
            return

        for row in rows:
            hashes = hash_phone_search_fragments(row["phone_normalized"])
            if not hashes:
                raise RuntimeError(
                    "0059 phone-fragment backfill found a client without a canonical searchable phone; "
                    "migration aborted"
                )
            bind.execute(
                sa.text(
                    "UPDATE crm_clients SET phone_fragment_hashes = :phone_fragment_hashes "
                    "WHERE id = :client_id"
                ),
                {"client_id": row["id"], "phone_fragment_hashes": hashes},
            )
        last_client_id = rows[-1]["id"]


def upgrade() -> None:
    bind = op.get_bind()
    validate_configured_key_identities(bind)

    op.add_column(
        "crm_clients",
        sa.Column("phone_fragment_hashes", postgresql.ARRAY(sa.String(length=64)), nullable=True),
    )
    op.create_index(
        "ix_crm_clients_phone_fragment_hashes",
        "crm_clients",
        ["phone_fragment_hashes"],
        unique=False,
        postgresql_using="gin",
    )

    _backfill_phone_fragment_hashes(bind)

    op.alter_column(
        "crm_clients",
        "phone_fragment_hashes",
        existing_type=postgresql.ARRAY(sa.String(length=64)),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_index("ix_crm_clients_phone_fragment_hashes", table_name="crm_clients")
    op.drop_column("crm_clients", "phone_fragment_hashes")
