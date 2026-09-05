"""add crm notes"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0017_crm_notes"
down_revision = "0016_document_numbers_match_order_numbers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("number_text", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["crm_users.id"], name=op.f("fk_crm_notes_created_by_user_id_crm_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_notes")),
    )
    op.create_index("ix_crm_notes_created_at", "crm_notes", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crm_notes_created_at", table_name="crm_notes")
    op.drop_table("crm_notes")
