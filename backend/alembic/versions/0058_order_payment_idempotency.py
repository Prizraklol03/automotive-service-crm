"""Persist order payment idempotency keys.

Revision ID: 0058_order_payment_idempotency
Revises: 0057_standard_user_role_code
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0058_order_payment_idempotency"
down_revision = "0057_standard_user_role_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_order_payment_idempotency",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("crm_order_payments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("key_digest", sa.String(length=64), nullable=False),
        sa.Column("payload_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("order_id", "key_digest", name="uq_order_payment_idempotency_order_key"),
    )


def downgrade() -> None:
    op.drop_table("crm_order_payment_idempotency")
