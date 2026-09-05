"""crm notes telephone

Revision ID: 0020_crm_notes_telephone
Revises: 0019_service_catalog_sort_order
Create Date: 2026-03-27 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0020_crm_notes_telephone"
down_revision = "0019_service_catalog_sort_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_notes", sa.Column("telephone", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("crm_notes", "telephone")
