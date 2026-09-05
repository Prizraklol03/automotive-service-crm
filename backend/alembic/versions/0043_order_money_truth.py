"""normalize order money schema to target truth

Revision ID: 0043_order_money_truth
Revises: 0042_order_handover_at
Create Date: 2026-04-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0043_order_money_truth"
down_revision = "0042_order_handover_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.alter_column(
            "discount_rub",
            existing_type=sa.Numeric(12, 2),
            new_column_name="discount_value",
            existing_nullable=False,
        )
        batch_op.add_column(
            sa.Column("discount_type", sa.String(length=8), nullable=False, server_default="fixed")
        )
        batch_op.drop_column("profit")


def downgrade() -> None:
    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.add_column(
            sa.Column("profit", sa.Numeric(12, 2), nullable=False, server_default="0")
        )
        batch_op.drop_column("discount_type")
        batch_op.alter_column(
            "discount_value",
            existing_type=sa.Numeric(12, 2),
            new_column_name="discount_rub",
            existing_nullable=False,
        )

    op.execute("UPDATE crm_orders SET profit = amount_to_pay")
