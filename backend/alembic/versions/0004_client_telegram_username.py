"""Add client telegram username field and preserve legacy telegram id."""

from alembic import op
import sqlalchemy as sa


revision = "0004_client_telegram_username"
down_revision = ("0003_employee_telegram_and_service_cleanup", "0003_emp_tg_service_cleanup")
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("clients") as batch_op:
        batch_op.add_column(sa.Column("telegram_username", sa.String(length=65), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("clients") as batch_op:
        batch_op.drop_column("telegram_username")
