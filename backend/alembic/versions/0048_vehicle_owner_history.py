"""create authoritative vehicle owner history ledger

Revision ID: 0048_vehicle_owner_history
Revises: 0047_materials_journal
Create Date: 2026-04-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0048_vehicle_owner_history"
down_revision = "0047_materials_journal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_vehicle_owner_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("owned_from", sa.Date(), nullable=False),
        sa.Column("owned_to", sa.Date(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["client_id"], ["crm_clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["crm_vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crm_vehicle_owner_history_vehicle_id", "crm_vehicle_owner_history", ["vehicle_id"], unique=False)

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute(
            """
            CREATE UNIQUE INDEX uq_crm_vehicle_owner_history_open_owner
            ON crm_vehicle_owner_history (vehicle_id)
            WHERE owned_to IS NULL
            """
        )
    else:
        op.execute(
            """
            CREATE UNIQUE INDEX uq_crm_vehicle_owner_history_open_owner
            ON crm_vehicle_owner_history (vehicle_id)
            WHERE owned_to IS NULL
            """
        )

    op.execute(
        """
        INSERT INTO crm_vehicle_owner_history (vehicle_id, client_id, owned_from, owned_to, comment, created_at, updated_at)
        SELECT id, client_id, DATE(created_at), NULL, NULL, created_at, updated_at
        FROM crm_vehicles
        """
    )


def downgrade() -> None:
    op.drop_index("uq_crm_vehicle_owner_history_open_owner", table_name="crm_vehicle_owner_history")
    op.drop_index("ix_crm_vehicle_owner_history_vehicle_id", table_name="crm_vehicle_owner_history")
    op.drop_table("crm_vehicle_owner_history")
