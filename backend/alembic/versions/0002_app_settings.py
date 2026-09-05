"""Add app settings table."""

from alembic import op
import sqlalchemy as sa


revision = "0002_app_settings"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bot_token", sa.Text(), nullable=True),
        sa.Column("bot_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allowed_telegram_user_ids", sa.Text(), nullable=False, server_default=""),
        sa.Column("backup_dir", sa.String(length=512), nullable=False, server_default="./backups"),
        sa.Column("update_channel", sa.String(length=64), nullable=False, server_default="stable"),
        sa.Column("app_version", sa.String(length=64), nullable=False, server_default="0.1.0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_settings")),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
