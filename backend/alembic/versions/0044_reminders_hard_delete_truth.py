"""align reminder lifecycle statuses with target truth

Revision ID: 0044_reminders_hard_delete_truth
Revises: 0043_order_money_truth
Create Date: 2026-04-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0044_reminders_hard_delete_truth"
down_revision = "0043_order_money_truth"
branch_labels = None
depends_on = None


OLD_STATUS_ENUM = sa.Enum(
    "active",
    "postponed",
    "done",
    "deleted",
    name="crm_reminder_status_enum",
    native_enum=False,
)

NEW_STATUS_ENUM = sa.Enum(
    "active",
    "postponed",
    "done",
    "expired",
    name="crm_reminder_status_enum",
    native_enum=False,
)


def _dialect() -> str:
    return op.get_bind().dialect.name


def _drop_postgresql_status_constraints() -> None:
    op.execute("ALTER TABLE crm_reminders DROP CONSTRAINT IF EXISTS crm_reminder_status_enum")
    op.execute("ALTER TABLE crm_reminders DROP CONSTRAINT IF EXISTS ck_crm_reminders_crm_reminder_status_enum")


def upgrade() -> None:
    if _dialect() == "postgresql":
        _drop_postgresql_status_constraints()
        op.execute("UPDATE crm_reminders SET status = 'expired' WHERE status = 'deleted'")
        op.create_check_constraint(
            "crm_reminder_status_enum",
            "crm_reminders",
            "status IN ('active', 'postponed', 'done', 'expired')",
        )
        return

    op.execute("UPDATE crm_reminders SET status = 'expired' WHERE status = 'deleted'")

    with op.batch_alter_table("crm_reminders", recreate="always") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=OLD_STATUS_ENUM,
            type_=NEW_STATUS_ENUM,
            existing_nullable=False,
            existing_server_default=sa.text("'active'"),
            server_default="active",
        )


def downgrade() -> None:
    if _dialect() == "postgresql":
        _drop_postgresql_status_constraints()
        op.execute("UPDATE crm_reminders SET status = 'deleted' WHERE status = 'expired'")
        op.create_check_constraint(
            "crm_reminder_status_enum",
            "crm_reminders",
            "status IN ('active', 'postponed', 'done', 'deleted')",
        )
        return

    op.execute("UPDATE crm_reminders SET status = 'deleted' WHERE status = 'expired'")

    with op.batch_alter_table("crm_reminders", recreate="always") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=NEW_STATUS_ENUM,
            type_=OLD_STATUS_ENUM,
            existing_nullable=False,
            existing_server_default=sa.text("'active'"),
            server_default="active",
        )
