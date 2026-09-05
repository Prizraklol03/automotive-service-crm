from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0021_finance_expenses"
down_revision = "0020_crm_notes_telephone"
branch_labels = None
depends_on = None


DEFAULT_CATEGORY_NAMES = (
    "Зарплата",
    "Аванс",
    "Хозрасходы",
    "Закупка материалов",
    "Напитки",
    "Прочее",
)


def upgrade() -> None:
    op.create_table(
        "crm_finance_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_crm_finance_categories_name"),
    )

    op.create_table(
        "crm_finance_expenses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["category_id"], ["crm_finance_categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["crm_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    finance_categories = sa.table("crm_finance_categories", sa.column("name", sa.String()))
    op.bulk_insert(finance_categories, [{"name": name} for name in DEFAULT_CATEGORY_NAMES])


def downgrade() -> None:
    op.drop_table("crm_finance_expenses")
    op.drop_table("crm_finance_categories")
