"""user permissions

Revision ID: 0051_user_permissions
Revises: 0050_material_attachments
Create Date: 2026-05-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0051_user_permissions"
down_revision = "0050_material_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_user_permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("permission_code", sa.String(length=64), nullable=False),
        sa.Column("is_allowed", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["crm_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["crm_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "permission_code", name="uq_crm_user_permissions_user_id_permission_code"),
    )
    op.create_index("ix_crm_user_permissions_user_id", "crm_user_permissions", ["user_id"], unique=False)
    op.create_index("ix_crm_user_permissions_permission_code", "crm_user_permissions", ["permission_code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crm_user_permissions_permission_code", table_name="crm_user_permissions")
    op.drop_index("ix_crm_user_permissions_user_id", table_name="crm_user_permissions")
    op.drop_table("crm_user_permissions")
