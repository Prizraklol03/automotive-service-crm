from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0022_order_due_date"
down_revision = "0021_finance_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_orders", sa.Column("due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("crm_orders", "due_date")
