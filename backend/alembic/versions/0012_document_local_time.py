from __future__ import annotations

from alembic import op


revision = "0012_document_local_time"
down_revision = "0011_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            """
            UPDATE crm_documents
            SET
                created_at = datetime(created_at, '+7 hours'),
                updated_at = datetime(updated_at, '+7 hours')
            """
        )
        return

    if dialect == "postgresql":
        op.execute(
            """
            UPDATE crm_documents
            SET
                created_at = created_at + interval '7 hours',
                updated_at = updated_at + interval '7 hours'
            """
        )
        return

    raise RuntimeError(f"Unsupported dialect for document time migration: {dialect}")


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            """
            UPDATE crm_documents
            SET
                created_at = datetime(created_at, '-7 hours'),
                updated_at = datetime(updated_at, '-7 hours')
            """
        )
        return

    if dialect == "postgresql":
        op.execute(
            """
            UPDATE crm_documents
            SET
                created_at = created_at - interval '7 hours',
                updated_at = updated_at - interval '7 hours'
            """
        )
        return

    raise RuntimeError(f"Unsupported dialect for document time migration: {dialect}")
