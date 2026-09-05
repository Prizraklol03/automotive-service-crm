from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0014_material_expenses"
down_revision = "0013_document_last_rendered_fix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_material_expenses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("material_name", sa.String(length=255), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("row_total", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("service_category_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["service_category_id"], ["crm_service_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            """
            INSERT INTO crm_material_expenses (
                material_name,
                unit_price,
                quantity,
                row_total,
                expense_date,
                service_category_id,
                created_at,
                updated_at
            )
            SELECT
                m.material_name,
                m.unit_price,
                m.quantity,
                m.row_total,
                COALESCE(date(m.created_at), date(o.completed_at), date(o.created_at), date('now', '+7 hours')),
                sc.id,
                m.created_at,
                m.updated_at
            FROM crm_order_materials m
            JOIN crm_orders o ON o.id = m.order_id
            LEFT JOIN crm_order_services os ON os.id = m.order_service_id
            LEFT JOIN crm_services_catalog s ON s.id = os.service_catalog_id
            LEFT JOIN crm_service_categories sc ON sc.id = s.category_id
            """
        )
    else:
        op.execute(
            """
            INSERT INTO crm_material_expenses (
                material_name,
                unit_price,
                quantity,
                row_total,
                expense_date,
                service_category_id,
                created_at,
                updated_at
            )
            SELECT
                m.material_name,
                m.unit_price,
                m.quantity,
                m.row_total,
                COALESCE(CAST(m.created_at AS date), CAST(o.completed_at AS date), CAST(o.created_at AS date), CURRENT_DATE),
                sc.id,
                m.created_at,
                m.updated_at
            FROM crm_order_materials m
            JOIN crm_orders o ON o.id = m.order_id
            LEFT JOIN crm_order_services os ON os.id = m.order_service_id
            LEFT JOIN crm_services_catalog s ON s.id = os.service_catalog_id
            LEFT JOIN crm_service_categories sc ON sc.id = s.category_id
            """
        )

    op.execute("UPDATE crm_orders SET materials_total = 0.00, profit = amount_to_pay")
    op.execute("DELETE FROM crm_order_materials")


def downgrade() -> None:
    op.drop_table("crm_material_expenses")
