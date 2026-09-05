"""update order sorting defaults

Revision ID: 0035_update_order_sorting_defaults
Revises: 0034_user_preferences
Create Date: 2026-04-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


revision = "0035_update_order_sorting_defaults"
down_revision = "0034_user_preferences"
branch_labels = None
depends_on = None


OLD_DEFAULT = '[{"key": "status", "direction": "asc"}, {"key": "scheduled_for", "direction": "asc"}, {"key": "id", "direction": "asc"}]'
NEW_DEFAULT = '[{"key": "status", "direction": "asc"}, {"key": "scheduled_for", "direction": "asc"}, {"key": "id", "direction": "desc"}]'


def upgrade() -> None:
    op.execute(
        "UPDATE crm_user_preferences "
        f"SET order_sorting = '{NEW_DEFAULT}' "
        f"WHERE order_sorting = '{OLD_DEFAULT}'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE crm_user_preferences "
        f"SET order_sorting = '{OLD_DEFAULT}' "
        f"WHERE order_sorting = '{NEW_DEFAULT}'"
    )
