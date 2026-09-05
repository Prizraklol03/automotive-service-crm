"""Fix reminder enum constraints and column lengths.

The original migration (0008) created target_type as VARCHAR(6) (length of
the longest initial value 'client') and status as VARCHAR(9) ('postponed').
Adding 'standalone' (10 chars) and 'vehicle' (7 chars) to target_type, and
'deleted' (7 chars) to status requires widening the columns first, then
updating the CHECK constraints.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0031_fix_reminder_enum_constraints"
down_revision = "0030_drop_order_materials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return

    # Widen target_type column: VARCHAR(6) → VARCHAR(16)
    # 'standalone' is 10 chars, original max was 6 ('client')
    op.execute(sa.text(
        "ALTER TABLE crm_reminders DROP CONSTRAINT IF EXISTS crm_reminder_target_type_enum"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ALTER COLUMN target_type TYPE VARCHAR(16)"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ADD CONSTRAINT crm_reminder_target_type_enum "
        "CHECK (target_type IN ('client', 'order', 'vehicle', 'standalone'))"
    ))

    # Widen status column: VARCHAR(9) → VARCHAR(16)
    # 'postponed' is already 9 chars, 'deleted' is 7 — current length is fine,
    # but widen for safety alongside dropping the old constraint
    op.execute(sa.text(
        "ALTER TABLE crm_reminders DROP CONSTRAINT IF EXISTS crm_reminder_status_enum"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ALTER COLUMN status TYPE VARCHAR(16)"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ADD CONSTRAINT crm_reminder_status_enum "
        "CHECK (status IN ('active', 'postponed', 'done', 'deleted'))"
    ))

    # Widen text column: VARCHAR(500) → TEXT (schema allows 2000 chars)
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ALTER COLUMN text TYPE TEXT"
    ))


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return

    op.execute(sa.text(
        "ALTER TABLE crm_reminders DROP CONSTRAINT IF EXISTS crm_reminder_target_type_enum"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ALTER COLUMN target_type TYPE VARCHAR(6)"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ADD CONSTRAINT crm_reminder_target_type_enum "
        "CHECK (target_type IN ('client', 'order'))"
    ))

    op.execute(sa.text(
        "ALTER TABLE crm_reminders DROP CONSTRAINT IF EXISTS crm_reminder_status_enum"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ALTER COLUMN status TYPE VARCHAR(9)"
    ))
    op.execute(sa.text(
        "ALTER TABLE crm_reminders ADD CONSTRAINT crm_reminder_status_enum "
        "CHECK (status IN ('active', 'postponed', 'done'))"
    ))

    op.execute(sa.text(
        "ALTER TABLE crm_reminders ALTER COLUMN text TYPE VARCHAR(500)"
    ))
