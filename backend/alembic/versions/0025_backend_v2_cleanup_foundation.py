"""Finalize backend v2.0 foundation.

Controlled legacy table drop plan:
- Legacy tables remain untouched in this migration on purpose.
- Runtime and Alembic metadata now rely exclusively on `app.crm.models`.
- After production backup verification and data-retention review, legacy-only
  tables can be dropped in a dedicated follow-up migration.
- Candidate legacy tables: activity_logs, app_settings, cars, clients,
  employees, order_employees, order_services, orders, payments, services,
  service_categories.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0025_backend_v2_cleanup_foundation"
down_revision = "0024_restore_client_telegram_username"
branch_labels = None
depends_on = None


def _get_column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    try:
        return {column["name"] for column in inspector.get_columns(table_name)}
    except sa.exc.NoSuchTableError:
        return set()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = _get_column_names(inspector, "crm_users")
    if user_columns and "token_version" not in user_columns:
        with op.batch_alter_table("crm_users") as batch_op:
            batch_op.add_column(sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"))

    document_columns = _get_column_names(inspector, "crm_documents")
    if document_columns:
        with op.batch_alter_table("crm_documents") as batch_op:
            if "last_pdf_engine" not in document_columns:
                batch_op.add_column(sa.Column("last_pdf_engine", sa.String(length=64), nullable=True))
            if "last_pdf_generation_note" not in document_columns:
                batch_op.add_column(sa.Column("last_pdf_generation_note", sa.String(length=255), nullable=True))

    op.execute(sa.text("UPDATE crm_users SET token_version = 1 WHERE token_version IS NULL"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    document_columns = _get_column_names(inspector, "crm_documents")
    if document_columns:
        with op.batch_alter_table("crm_documents") as batch_op:
            if "last_pdf_generation_note" in document_columns:
                batch_op.drop_column("last_pdf_generation_note")
            if "last_pdf_engine" in document_columns:
                batch_op.drop_column("last_pdf_engine")

    user_columns = _get_column_names(inspector, "crm_users")
    if "token_version" in user_columns:
        with op.batch_alter_table("crm_users") as batch_op:
            batch_op.drop_column("token_version")
