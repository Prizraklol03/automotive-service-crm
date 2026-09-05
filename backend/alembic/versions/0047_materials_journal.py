"""rename material expenses table to canonical materials journal

Revision ID: 0047_materials_journal
Revises: 0046_canonical_order_statuses
Create Date: 2026-04-20
"""

from __future__ import annotations

from alembic import op

revision = "0047_materials_journal"
down_revision = "0046_canonical_order_statuses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("crm_material_expenses", "crm_materials")


def downgrade() -> None:
    op.rename_table("crm_materials", "crm_material_expenses")
