"""Restore client telegram username after bot scope cleanup."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0024_restore_client_telegram_username"
down_revision = "0023_remove_telegram_bot_scope"
branch_labels = None
depends_on = None


def _get_column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    try:
        return {column["name"] for column in inspector.get_columns(table_name)}
    except sa.exc.NoSuchTableError:
        return set()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    crm_client_columns = _get_column_names(inspector, "crm_clients")
    if crm_client_columns and "telegram_username" not in crm_client_columns:
        with op.batch_alter_table("crm_clients") as batch_op:
            batch_op.add_column(sa.Column("telegram_username", sa.String(length=65), nullable=True))

    legacy_client_columns = _get_column_names(inspector, "clients")
    if legacy_client_columns and "telegram_username" not in legacy_client_columns:
        with op.batch_alter_table("clients") as batch_op:
            batch_op.add_column(sa.Column("telegram_username", sa.String(length=65), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    crm_client_columns = _get_column_names(inspector, "crm_clients")
    if "telegram_username" in crm_client_columns:
        with op.batch_alter_table("crm_clients") as batch_op:
            batch_op.drop_column("telegram_username")

    legacy_client_columns = _get_column_names(inspector, "clients")
    if "telegram_username" in legacy_client_columns:
        with op.batch_alter_table("clients") as batch_op:
            batch_op.drop_column("telegram_username")
