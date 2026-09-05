"""custom fields

Revision ID: 0039
Revises: 0038
Create Date: 2026-04-12

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0039"
down_revision = "0038_order_statuses"
branch_labels = None
depends_on = None


def _json_type() -> sa.types.TypeEngine:
    """Returns JSONB on PostgreSQL, JSON on everything else."""
    from sqlalchemy.dialects import postgresql
    import sqlalchemy.dialects.sqlite  # noqa
    try:
        from alembic import context
        dialect = context.get_context().dialect
        if dialect.name == "postgresql":
            return postgresql.JSONB(astext_type=sa.Text())
    except Exception:
        pass
    return sa.JSON()


def upgrade() -> None:
    op.create_table(
        "crm_custom_field_defs",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("field_type", sa.String(32), nullable=False, server_default="text"),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("placeholder", sa.String(255), nullable=True),
        sa.Column("options", _json_type(), nullable=True),
    )

    op.create_table(
        "crm_order_field_values",
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("crm_orders.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("field_key", sa.String(64), sa.ForeignKey("crm_custom_field_defs.key", ondelete="CASCADE"), primary_key=True),
        sa.Column("value", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("crm_order_field_values")
    op.drop_table("crm_custom_field_defs")
