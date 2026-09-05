"""add order payments

Revision ID: 0049_order_payments
Revises: 0048_vehicle_owner_history
Create Date: 2026-05-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0049_order_payments"
down_revision = "0048_vehicle_owner_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_order_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column(
            "payment_method",
            sa.Enum("cash", "card", "transfer", "other", name="orderpaymentmethod", native_enum=False),
            nullable=False,
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["crm_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["crm_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_crm_order_payments_order_id",
        "crm_order_payments",
        ["order_id"],
        unique=False,
    )
    op.create_index(
        "ix_crm_order_payments_payment_date",
        "crm_order_payments",
        ["payment_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_crm_order_payments_payment_date", table_name="crm_order_payments")
    op.drop_index("ix_crm_order_payments_order_id", table_name="crm_order_payments")
    op.drop_table("crm_order_payments")
