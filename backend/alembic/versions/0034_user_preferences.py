"""add user preferences

Revision ID: 0034_user_preferences
Revises: 0033_order_schedule_datetime
Create Date: 2026-04-10 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0034_user_preferences"
down_revision = "0033_order_schedule_datetime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_user_preferences",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("order_sorting", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["crm_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("crm_user_preferences")
