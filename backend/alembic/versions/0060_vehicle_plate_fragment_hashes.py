"""Add privacy-preserving vehicle plate fragment hashes.

Revision ID: 0060_vehicle_plate_fragment_hashes
Revises: 0059_client_phone_fragment_hashes

The backfill derives blind indexes from the existing canonical
``plate_number_normalized`` value. Configured key identities are validated
before DDL so unavailable or mismatched hash keys cannot leave partial schema.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.key_identity import validate_configured_key_identities
from app.core.privacy import hash_plate_search_fragments

revision = "0060_vehicle_plate_fragment_hashes"
down_revision = "0059_client_phone_fragment_hashes"
branch_labels = None
depends_on = None
BACKFILL_BATCH_SIZE = 500


def _backfill_plate_fragment_hashes(bind) -> None:
    last_vehicle_id = 0
    while True:
        rows = bind.execute(
            sa.text(
                "SELECT id, plate_number_normalized FROM crm_vehicles "
                "WHERE id > :last_vehicle_id ORDER BY id LIMIT :batch_size"
            ),
            {"last_vehicle_id": last_vehicle_id, "batch_size": BACKFILL_BATCH_SIZE},
        ).mappings().all()
        if not rows:
            return

        for row in rows:
            hashes = hash_plate_search_fragments(row["plate_number_normalized"])
            if not hashes:
                raise RuntimeError(
                    "0060 plate-fragment backfill found a vehicle without a canonical searchable plate; "
                    "migration aborted"
                )
            bind.execute(
                sa.text(
                    "UPDATE crm_vehicles SET plate_fragment_hashes = :plate_fragment_hashes "
                    "WHERE id = :vehicle_id"
                ),
                {"vehicle_id": row["id"], "plate_fragment_hashes": hashes},
            )
        last_vehicle_id = rows[-1]["id"]


def upgrade() -> None:
    bind = op.get_bind()
    validate_configured_key_identities(bind)

    op.add_column(
        "crm_vehicles",
        sa.Column("plate_fragment_hashes", postgresql.ARRAY(sa.String(length=64)), nullable=True),
    )
    op.create_index(
        "ix_crm_vehicles_plate_fragment_hashes",
        "crm_vehicles",
        ["plate_fragment_hashes"],
        unique=False,
        postgresql_using="gin",
    )

    _backfill_plate_fragment_hashes(bind)

    op.alter_column(
        "crm_vehicles",
        "plate_fragment_hashes",
        existing_type=postgresql.ARRAY(sa.String(length=64)),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_index("ix_crm_vehicles_plate_fragment_hashes", table_name="crm_vehicles")
    op.drop_column("crm_vehicles", "plate_fragment_hashes")
