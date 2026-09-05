"""Create CRM Stage 1A foundation tables."""

from alembic import op
import sqlalchemy as sa


revision = "0005_crm_stage1a_foundation"
down_revision = "0004_client_telegram_username"
branch_labels = None
depends_on = None


order_status = sa.Enum(
    "draft",
    "waiting",
    "in_progress",
    "postponed",
    "completed",
    "cancelled",
    name="crmorderstatus",
    native_enum=False,
)


def upgrade() -> None:
    op.create_table(
        "crm_roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_roles")),
        sa.UniqueConstraint("code", name=op.f("uq_crm_roles_code")),
    )
    op.create_table(
        "crm_clients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone_display", sa.String(length=32), nullable=False),
        sa.Column("phone_normalized", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_clients")),
        sa.UniqueConstraint("phone_normalized", name=op.f("uq_crm_clients_phone_normalized")),
    )
    op.create_table(
        "crm_service_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_service_categories")),
        sa.UniqueConstraint("name", name=op.f("uq_crm_service_categories_name")),
    )
    op.create_table(
        "crm_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("login", sa.String(length=128), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["crm_roles.id"], name=op.f("fk_crm_users_role_id_crm_roles"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_users")),
        sa.UniqueConstraint("login", name=op.f("uq_crm_users_login")),
    )
    op.create_table(
        "crm_vehicles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("plate_number_display", sa.String(length=32), nullable=False),
        sa.Column("plate_number_normalized", sa.String(length=32), nullable=False),
        sa.Column("vin", sa.String(length=32), nullable=True),
        sa.Column("brand", sa.String(length=128), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=64), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["crm_clients.id"], name=op.f("fk_crm_vehicles_client_id_crm_clients"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_vehicles")),
        sa.UniqueConstraint("plate_number_normalized", name=op.f("uq_crm_vehicles_plate_number_normalized")),
    )
    op.create_table(
        "crm_services_catalog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("default_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["crm_service_categories.id"], name=op.f("fk_crm_services_catalog_category_id_crm_service_categories"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_services_catalog")),
        sa.UniqueConstraint("category_id", "name", name="uq_crm_services_catalog_category_name"),
    )
    op.create_table(
        "crm_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("status", order_status, nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("discount_rub", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("services_total", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("amount_to_pay", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("materials_total", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("profit", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("archived_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["crm_clients.id"], name=op.f("fk_crm_orders_client_id_crm_clients"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["crm_vehicles.id"], name=op.f("fk_crm_orders_vehicle_id_crm_vehicles"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_orders")),
    )
    op.create_table(
        "crm_order_services",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("service_catalog_id", sa.Integer(), nullable=True),
        sa.Column("service_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("category_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("row_total", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("sort_key", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["crm_orders.id"], name=op.f("fk_crm_order_services_order_id_crm_orders"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_catalog_id"], ["crm_services_catalog.id"], name=op.f("fk_crm_order_services_service_catalog_id_crm_services_catalog"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_order_services")),
    )
    op.create_table(
        "crm_order_materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("order_service_id", sa.Integer(), nullable=False),
        sa.Column("material_name", sa.String(length=255), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("row_total", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("sort_key", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["crm_orders.id"], name=op.f("fk_crm_order_materials_order_id_crm_orders"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_service_id"], ["crm_order_services.id"], name=op.f("fk_crm_order_materials_order_service_id_crm_order_services"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_order_materials")),
    )


def downgrade() -> None:
    op.drop_table("crm_order_materials")
    op.drop_table("crm_order_services")
    op.drop_table("crm_orders")
    op.drop_table("crm_services_catalog")
    op.drop_table("crm_vehicles")
    op.drop_table("crm_users")
    op.drop_table("crm_service_categories")
    op.drop_table("crm_clients")
    op.drop_table("crm_roles")
