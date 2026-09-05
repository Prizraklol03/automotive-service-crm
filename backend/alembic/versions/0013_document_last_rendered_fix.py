from __future__ import annotations

from alembic import op


revision = "0013_document_last_rendered_fix"
down_revision = "0012_document_local_time"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            """
            UPDATE crm_documents
            SET last_rendered_at = datetime(last_rendered_at, '-7 hours')
            WHERE last_rendered_at IS NOT NULL
              AND updated_at IS NOT NULL
              AND last_rendered_at > datetime(updated_at, '+6 hours')
            """
        )
        return

    if dialect == "postgresql":
        op.execute(
            """
            UPDATE crm_documents
            SET last_rendered_at = last_rendered_at - interval '7 hours'
            WHERE last_rendered_at IS NOT NULL
              AND updated_at IS NOT NULL
              AND last_rendered_at > updated_at + interval '6 hours'
            """
        )
        return

    raise RuntimeError(f"Unsupported dialect for document last_rendered_at fix: {dialect}")


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            """
            UPDATE crm_documents
            SET last_rendered_at = datetime(last_rendered_at, '+7 hours')
            WHERE last_rendered_at IS NOT NULL
              AND updated_at IS NOT NULL
              AND last_rendered_at <= datetime(updated_at, '+1 hours')
            """
        )
        return

    if dialect == "postgresql":
        op.execute(
            """
            UPDATE crm_documents
            SET last_rendered_at = last_rendered_at + interval '7 hours'
            WHERE last_rendered_at IS NOT NULL
              AND updated_at IS NOT NULL
              AND last_rendered_at <= updated_at + interval '1 hours'
            """
        )
        return

    raise RuntimeError(f"Unsupported dialect for document last_rendered_at fix: {dialect}")
