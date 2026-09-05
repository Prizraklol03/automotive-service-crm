"""add order photos

Revision ID: 0037_order_photos
Revises: 0036_modules_config
Create Date: 2026-04-11 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0037_order_photos"
down_revision = "0036_modules_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_orders", sa.Column("photo_share_token", sa.String(64), nullable=True))
    op.create_index("ix_crm_orders_photo_share_token", "crm_orders", ["photo_share_token"], unique=True)

    op.create_table(
        "crm_order_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("thumb_path", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_crm_order_photos_order_id", "crm_order_photos", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_crm_order_photos_order_id", "crm_order_photos")
    op.drop_table("crm_order_photos")
    op.drop_index("ix_crm_orders_photo_share_token", "crm_orders")
    op.drop_column("crm_orders", "photo_share_token")
