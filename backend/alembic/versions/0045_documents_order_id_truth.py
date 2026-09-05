"""enforce document number truth and remove legacy numbering setting

Revision ID: 0045_documents_order_id_truth
Revises: 0044_reminders_hard_delete_truth
Create Date: 2026-04-20
"""

from __future__ import annotations

from alembic import op

revision = "0045_documents_order_id_truth"
down_revision = "0044_reminders_hard_delete_truth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE crm_documents
        SET document_number = order_id
        """
    )
    op.execute(
        """
        DELETE FROM crm_settings
        WHERE key = 'next_document_number'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO crm_settings (key, value)
        SELECT 'next_document_number', CAST(COALESCE(MAX(document_number), 0) + 1 AS VARCHAR)
        FROM crm_documents
        WHERE NOT EXISTS (
            SELECT 1 FROM crm_settings WHERE key = 'next_document_number'
        )
        """
    )
