"""Widen reminder target_type and status columns.

Migration 0031 updated the CHECK constraints but ALTER COLUMN TYPE did not
take effect within the same transaction. This migration applies the column
widening separately so the columns can actually store the new enum values.

target_type: character varying(6)  → character varying(16)
             ('client' was the longest original value at 6 chars;
              'standalone' is 10 chars and was failing at insert)
status:      character varying(9)  → character varying(16)
             (kept for symmetry and future-proofing)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0032_widen_reminder_enum_columns"
down_revision = "0031_fix_reminder_enum_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_reminders") as batch_op:
        batch_op.alter_column(
            "target_type",
            existing_type=sa.String(6),
            type_=sa.String(16),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "status",
            existing_type=sa.String(9),
            type_=sa.String(16),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("crm_reminders") as batch_op:
        batch_op.alter_column(
            "target_type",
            existing_type=sa.String(16),
            type_=sa.String(6),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "status",
            existing_type=sa.String(16),
            type_=sa.String(9),
            existing_nullable=False,
        )
