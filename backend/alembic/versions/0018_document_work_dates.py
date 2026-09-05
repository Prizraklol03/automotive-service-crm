"""document work dates

Revision ID: 0018_document_work_dates
Revises: 0017_crm_notes
Create Date: 2026-03-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_document_work_dates"
down_revision = "0017_crm_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_documents", sa.Column("work_started_at", sa.DateTime(timezone=False), nullable=True))
    op.add_column("crm_documents", sa.Column("work_completed_at", sa.DateTime(timezone=False), nullable=True))


def downgrade() -> None:
    op.drop_column("crm_documents", "work_completed_at")
    op.drop_column("crm_documents", "work_started_at")
