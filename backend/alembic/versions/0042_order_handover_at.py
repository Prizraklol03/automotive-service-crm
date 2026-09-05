"""add handover datetime to orders

Revision ID: 0042_order_handover_at
Revises: 0041_document_inspection_act
Create Date: 2026-04-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0042_order_handover_at"
down_revision = "0041_document_inspection_act"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.add_column(sa.Column("handover_at", sa.DateTime(timezone=False), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.drop_column("handover_at")
