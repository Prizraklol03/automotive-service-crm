"""order schedule datetime

Revision ID: 0033_order_schedule_datetime
Revises: 0032_widen_reminder_enum_columns
Create Date: 2026-04-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0033_order_schedule_datetime"
down_revision = "0032_widen_reminder_enum_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.alter_column(
            "due_date",
            existing_type=sa.Date(),
            type_=sa.DateTime(timezone=False),
            existing_nullable=True,
            postgresql_using="due_date::timestamp",
        )
        batch_op.alter_column(
            "scheduled_for",
            existing_type=sa.Date(),
            type_=sa.DateTime(timezone=False),
            existing_nullable=True,
            postgresql_using="scheduled_for::timestamp",
        )


def downgrade() -> None:
    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.alter_column(
            "scheduled_for",
            existing_type=sa.DateTime(timezone=False),
            type_=sa.Date(),
            existing_nullable=True,
            postgresql_using="scheduled_for::date",
        )
        batch_op.alter_column(
            "due_date",
            existing_type=sa.DateTime(timezone=False),
            type_=sa.Date(),
            existing_nullable=True,
            postgresql_using="due_date::date",
        )
