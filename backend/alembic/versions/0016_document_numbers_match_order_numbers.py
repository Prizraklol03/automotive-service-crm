"""make document numbers match order numbers"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0016_document_numbers_match_order_numbers"
down_revision = "0015_reset_vehicle_catalog_to_local_bundle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_documents") as batch_op:
        batch_op.drop_constraint("uq_crm_documents_document_number", type_="unique")

    op.execute(
        """
        UPDATE crm_documents
        SET document_number = order_id
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE crm_documents
        SET document_number = id
        """
    )

    with op.batch_alter_table("crm_documents") as batch_op:
        batch_op.create_unique_constraint("uq_crm_documents_document_number", ["document_number"])
