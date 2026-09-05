"""Remove Telegram bot scope from active and legacy backend tables."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0023_remove_telegram_bot_scope"
down_revision = "0022_order_due_date"
branch_labels = None
depends_on = None


def _get_column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    try:
        return {column["name"] for column in inspector.get_columns(table_name)}
    except sa.exc.NoSuchTableError:
        return set()


def _drop_columns(table_name: str, column_names: list[str]) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = _get_column_names(inspector, table_name)
    columns_to_drop = [column_name for column_name in column_names if column_name in existing_columns]

    if not columns_to_drop:
        return

    with op.batch_alter_table(table_name) as batch_op:
        for column_name in columns_to_drop:
            batch_op.drop_column(column_name)


def upgrade() -> None:
    _drop_columns("clients", ["telegram_id"])
    _drop_columns("employees", ["telegram_user_id"])
    _drop_columns(
        "app_settings",
        [
            "bot_token",
            "bot_enabled",
            "allowed_telegram_user_ids",
            "bot_request_timeout_seconds",
            "bot_polling_timeout_seconds",
            "bot_startup_retries",
            "bot_retry_delay_seconds",
            "bot_startup_timeout_seconds",
        ],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    app_settings_columns = _get_column_names(inspector, "app_settings")
    if app_settings_columns:
        with op.batch_alter_table("app_settings") as batch_op:
            if "bot_token" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_token", sa.Text(), nullable=True))
            if "bot_enabled" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
            if "allowed_telegram_user_ids" not in app_settings_columns:
                batch_op.add_column(sa.Column("allowed_telegram_user_ids", sa.Text(), nullable=False, server_default=""))
            if "bot_request_timeout_seconds" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_request_timeout_seconds", sa.Integer(), nullable=False, server_default="30"))
            if "bot_polling_timeout_seconds" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_polling_timeout_seconds", sa.Integer(), nullable=False, server_default="30"))
            if "bot_startup_retries" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_startup_retries", sa.Integer(), nullable=False, server_default="4"))
            if "bot_retry_delay_seconds" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_retry_delay_seconds", sa.Integer(), nullable=False, server_default="5"))
            if "bot_startup_timeout_seconds" not in app_settings_columns:
                batch_op.add_column(sa.Column("bot_startup_timeout_seconds", sa.Integer(), nullable=False, server_default="45"))

    clients_columns = _get_column_names(inspector, "clients")
    if clients_columns:
        with op.batch_alter_table("clients") as batch_op:
            if "telegram_username" not in clients_columns:
                batch_op.add_column(sa.Column("telegram_username", sa.String(length=65), nullable=True))
            if "telegram_id" not in clients_columns:
                batch_op.add_column(sa.Column("telegram_id", sa.BigInteger(), nullable=True))

    employees_columns = _get_column_names(inspector, "employees")
    if employees_columns and "telegram_user_id" not in employees_columns:
        with op.batch_alter_table("employees") as batch_op:
            batch_op.add_column(sa.Column("telegram_user_id", sa.BigInteger(), nullable=True))
