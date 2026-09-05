"""add audit logs table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0011_audit_logs"
down_revision = "0010_clients_vehicles_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["crm_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crm_audit_logs_actor_user_id", "crm_audit_logs", ["actor_user_id"], unique=False)
    op.create_index("ix_crm_audit_logs_entity_type", "crm_audit_logs", ["entity_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crm_audit_logs_entity_type", table_name="crm_audit_logs")
    op.drop_index("ix_crm_audit_logs_actor_user_id", table_name="crm_audit_logs")
    op.drop_table("crm_audit_logs")
