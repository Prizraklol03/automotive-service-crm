"""Add employee telegram id, bot runtime settings, and drop service duration."""

from alembic import op
import sqlalchemy as sa


revision = "0003_employee_telegram_and_service_cleanup"
down_revision = "0002_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("employees") as batch_op:
        batch_op.add_column(sa.Column("telegram_user_id", sa.BigInteger(), nullable=True))

    with op.batch_alter_table("services") as batch_op:
        batch_op.drop_column("duration_minutes")

    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("bot_request_timeout_seconds", sa.Integer(), nullable=False, server_default="30"))
        batch_op.add_column(sa.Column("bot_polling_timeout_seconds", sa.Integer(), nullable=False, server_default="30"))
        batch_op.add_column(sa.Column("bot_startup_retries", sa.Integer(), nullable=False, server_default="4"))
        batch_op.add_column(sa.Column("bot_retry_delay_seconds", sa.Integer(), nullable=False, server_default="5"))
        batch_op.add_column(sa.Column("bot_startup_timeout_seconds", sa.Integer(), nullable=False, server_default="45"))


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("bot_startup_timeout_seconds")
        batch_op.drop_column("bot_retry_delay_seconds")
        batch_op.drop_column("bot_startup_retries")
        batch_op.drop_column("bot_polling_timeout_seconds")
        batch_op.drop_column("bot_request_timeout_seconds")

    with op.batch_alter_table("services") as batch_op:
        batch_op.add_column(sa.Column("duration_minutes", sa.Integer(), nullable=True))

    with op.batch_alter_table("employees") as batch_op:
        batch_op.drop_column("telegram_user_id")
