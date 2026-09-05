"""service catalog sort order

Revision ID: 0019_service_catalog_sort_order
Revises: 0018_document_work_dates
Create Date: 2026-03-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_service_catalog_sort_order"
down_revision = "0018_document_work_dates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_services_catalog", sa.Column("sort_order", sa.Integer(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, category_id
            FROM crm_services_catalog
            ORDER BY category_id ASC, name ASC, id ASC
            """
        )
    ).fetchall()

    current_category_id = None
    current_sort_order = 0
    for row in rows:
        if row.category_id != current_category_id:
            current_category_id = row.category_id
            current_sort_order = 1
        else:
            current_sort_order += 1

        connection.execute(
            sa.text("UPDATE crm_services_catalog SET sort_order = :sort_order WHERE id = :service_id"),
            {"sort_order": current_sort_order, "service_id": row.id},
        )

    with op.batch_alter_table("crm_services_catalog") as batch_op:
        batch_op.alter_column("sort_order", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("crm_services_catalog") as batch_op:
        batch_op.drop_column("sort_order")
