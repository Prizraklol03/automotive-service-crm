"""Introduce device-based rotating refresh sessions for auth."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0026_auth_device_sessions"
down_revision = "0025_backend_v2_cleanup_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_user_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=128), nullable=False),
        sa.Column("token_family_id", sa.String(length=64), nullable=False),
        sa.Column("device_type", sa.String(length=16), nullable=False),
        sa.Column("device_name", sa.String(length=255), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("revoke_reason", sa.String(length=64), nullable=True),
        sa.Column("replaced_by_session_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["replaced_by_session_id"], ["crm_user_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["crm_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("refresh_token_hash", name="uq_crm_user_sessions_refresh_token_hash"),
    )
    op.create_index(op.f("ix_crm_user_sessions_user_id"), "crm_user_sessions", ["user_id"], unique=False)
    op.create_index(op.f("ix_crm_user_sessions_token_family_id"), "crm_user_sessions", ["token_family_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_crm_user_sessions_token_family_id"), table_name="crm_user_sessions")
    op.drop_index(op.f("ix_crm_user_sessions_user_id"), table_name="crm_user_sessions")
    op.drop_table("crm_user_sessions")
