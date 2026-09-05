"""Legacy compatibility alias for the old 0003 employee cleanup revision id."""

from alembic import op


revision = "0003_emp_tg_service_cleanup"
down_revision = "0002_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older deployments referenced this shorter revision id. The canonical
    # migration body now lives in 0003_employee_telegram_and_service_cleanup,
    # so this alias intentionally stays schema-neutral and only preserves a
    # valid single migration graph.
    pass


def downgrade() -> None:
    pass
