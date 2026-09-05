"""add modules_config setting

Revision ID: 0036_modules_config
Revises: 0035_update_order_sorting_defaults
Create Date: 2026-04-11 00:00:00.000000
"""

from __future__ import annotations

import json

from alembic import op

revision = "0036_modules_config"
down_revision = "0035_update_order_sorting_defaults"
branch_labels = None
depends_on = None

DEFAULT_MODULES = {
    "photos": False,
    "scheduler": False,
    "warehouse": False,
    "vin_catalog": False,
    "labor_norms": False,
    "salary": False,
    "maintenance_schedule": False,
    "kanban": False,
    "online_booking": False,
    "client_portal": False,
}


def upgrade() -> None:
    default_value = json.dumps(DEFAULT_MODULES)
    op.execute(
        "INSERT INTO crm_settings (key, value, created_at, updated_at) "
        f"VALUES ('modules_config', '{default_value}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
        "ON CONFLICT (key) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM crm_settings WHERE key = 'modules_config'")
