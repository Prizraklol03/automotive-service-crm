"""Drop legacy crm_order_materials table and materials_total column from crm_orders.

The order-materials system was superseded by the standalone crm_material_expenses
table (added in 0014). All data was migrated and old rows were deleted in 0014,
but the table and column were kept as a safety net. This migration finalises the
cleanup:

  1. Fixes any orders where profit still diverges from amount_to_pay (can happen
     if orders were saved with the old code after migration 0014 ran).
  2. Drops the empty crm_order_materials table.
  3. Drops the now-unused materials_total column from crm_orders.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0030_drop_order_materials"
down_revision = "0029_order_scheduling_and_category_colors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 1. Ensure profit == amount_to_pay for every order.
    op.execute(sa.text("UPDATE crm_orders SET profit = amount_to_pay WHERE profit != amount_to_pay"))

    # 2. Drop the legacy junction table if it still exists.
    if "crm_order_materials" in inspector.get_table_names():
        op.drop_table("crm_order_materials")

    # 3. Drop materials_total from crm_orders if it still exists.
    order_columns = {col["name"] for col in inspector.get_columns("crm_orders")}
    if "materials_total" in order_columns:
        with op.batch_alter_table("crm_orders") as batch_op:
            batch_op.drop_column("materials_total")


def downgrade() -> None:
    # Data was already gone before this migration ran — nothing to restore.
    pass
