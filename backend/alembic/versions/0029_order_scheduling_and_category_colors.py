"""add order scheduling and service category colors

Revision ID: 0029_order_scheduling_and_category_colors
Revises: 0028_drop_legacy_archive_tables
Create Date: 2026-04-03 22:15:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0029_order_scheduling_and_category_colors"
down_revision = "0028_drop_legacy_archive_tables"
branch_labels = None
depends_on = None


DEFAULT_CATEGORY_COLORS = [
    "#4DA3FF",
    "#8E6CFF",
    "#F3A712",
    "#2FD6A2",
    "#F472B6",
    "#FACC15",
    "#FB7185",
    "#22C55E",
]


def upgrade() -> None:
    op.add_column("crm_orders", sa.Column("scheduled_for", sa.Date(), nullable=True))
    op.add_column(
        "crm_service_categories",
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#4DA3FF"),
    )

    connection = op.get_bind()
    categories = connection.execute(
        sa.text("SELECT id FROM crm_service_categories ORDER BY sort_order ASC, id ASC")
    ).fetchall()

    for index, row in enumerate(categories):
        connection.execute(
            sa.text("UPDATE crm_service_categories SET color = :color WHERE id = :id"),
            {"id": row.id, "color": DEFAULT_CATEGORY_COLORS[index % len(DEFAULT_CATEGORY_COLORS)]},
        )

    if connection.dialect.name != "sqlite":
        op.alter_column("crm_service_categories", "color", server_default=None)


def downgrade() -> None:
    op.drop_column("crm_service_categories", "color")
    op.drop_column("crm_orders", "scheduled_for")
