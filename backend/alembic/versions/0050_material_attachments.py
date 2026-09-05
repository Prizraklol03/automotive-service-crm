"""material attachments

Revision ID: 0050_material_attachments
Revises: 0049_order_payments
Create Date: 2026-05-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0050_material_attachments"
down_revision = "0049_order_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_material_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("crm_materials.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index(
        "ix_crm_material_attachments_material_id",
        "crm_material_attachments",
        ["material_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_crm_material_attachments_material_id", table_name="crm_material_attachments")
    op.drop_table("crm_material_attachments")
