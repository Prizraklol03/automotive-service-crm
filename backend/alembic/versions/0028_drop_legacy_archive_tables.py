"""Drop legacy archive tables after CRM v2.0 cutover.

This migration is intentionally destructive. It must be applied only after:
1. backup verification,
2. rehearsal on a production clone,
3. confirmation that no required historical data remains solely in the legacy tables.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0028_drop_legacy_archive_tables"
down_revision = "0027_drop_unused_runtime_columns"
branch_labels = None
depends_on = None


LEGACY_TABLE_DROP_ORDER = (
    "payments",
    "order_employees",
    "order_services",
    "orders",
    "cars",
    "clients",
    "employees",
    "services",
    "service_categories",
    "app_settings",
    "activity_logs",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table_name in LEGACY_TABLE_DROP_ORDER:
        if table_name in existing_tables:
            op.drop_table(table_name)


def downgrade() -> None:
    raise RuntimeError("0028_drop_legacy_archive_tables is destructive and cannot be downgraded automatically.")
