"""Correct CRM Stage 1A foundation gaps."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0006_crm_stage1a_corrections"
down_revision = "0005_crm_stage1a_foundation"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _get_column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not _has_table(inspector, table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _has_foreign_key(inspector: sa.Inspector, table_name: str, constrained_columns: list[str], referred_table: str) -> bool:
    if not _has_table(inspector, table_name):
        return False

    expected_columns = tuple(constrained_columns)
    for foreign_key in inspector.get_foreign_keys(table_name):
        if tuple(foreign_key.get("constrained_columns") or []) != expected_columns:
            continue
        if foreign_key.get("referred_table") == referred_table:
            return True
    return False


def _get_foreign_key_name(
    inspector: sa.Inspector, table_name: str, constrained_columns: list[str], referred_table: str
) -> str | None:
    if not _has_table(inspector, table_name):
        return None

    expected_columns = tuple(constrained_columns)
    for foreign_key in inspector.get_foreign_keys(table_name):
        if tuple(foreign_key.get("constrained_columns") or []) != expected_columns:
            continue
        if foreign_key.get("referred_table") == referred_table:
            return foreign_key.get("name")
    return None


def _is_sqlite(bind: sa.engine.Connection) -> bool:
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    client_columns = _get_column_names(inspector, "crm_clients")
    if "telegram_username" not in client_columns:
        op.add_column("crm_clients", sa.Column("telegram_username", sa.String(length=65), nullable=True))
        inspector = inspect(bind)

    if not _has_table(inspector, "crm_car_brands"):
        op.create_table(
            "crm_car_brands",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_car_brands")),
            sa.UniqueConstraint("name", name=op.f("uq_crm_car_brands_name")),
        )
        inspector = inspect(bind)
    if not _has_table(inspector, "crm_car_models"):
        op.create_table(
            "crm_car_models",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("brand_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["brand_id"], ["crm_car_brands.id"], name=op.f("fk_crm_car_models_brand_id_crm_car_brands"), ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_car_models")),
            sa.UniqueConstraint("brand_id", "name", name="uq_crm_car_models_brand_name"),
        )
        inspector = inspect(bind)

    vehicle_columns = _get_column_names(inspector, "crm_vehicles")
    if "brand_id" not in vehicle_columns:
        op.add_column("crm_vehicles", sa.Column("brand_id", sa.Integer(), nullable=True))
    if "model_id" not in vehicle_columns:
        op.add_column("crm_vehicles", sa.Column("model_id", sa.Integer(), nullable=True))
    if "mileage" not in vehicle_columns:
        op.add_column("crm_vehicles", sa.Column("mileage", sa.Integer(), nullable=True))

    inspector = inspect(bind)
    missing_brand_fk = not _has_foreign_key(inspector, "crm_vehicles", ["brand_id"], "crm_car_brands")
    missing_model_fk = not _has_foreign_key(inspector, "crm_vehicles", ["model_id"], "crm_car_models")
    if missing_brand_fk or missing_model_fk:
        if _is_sqlite(bind):
            with op.batch_alter_table("crm_vehicles", recreate="always") as batch_op:
                if missing_brand_fk:
                    batch_op.create_foreign_key(
                        op.f("fk_crm_vehicles_brand_id_crm_car_brands"),
                        "crm_car_brands",
                        ["brand_id"],
                        ["id"],
                        ondelete="RESTRICT",
                    )
                if missing_model_fk:
                    batch_op.create_foreign_key(
                        op.f("fk_crm_vehicles_model_id_crm_car_models"),
                        "crm_car_models",
                        ["model_id"],
                        ["id"],
                        ondelete="RESTRICT",
                    )
        else:
            if missing_brand_fk:
                op.create_foreign_key(
                    op.f("fk_crm_vehicles_brand_id_crm_car_brands"),
                    "crm_vehicles",
                    "crm_car_brands",
                    ["brand_id"],
                    ["id"],
                    ondelete="RESTRICT",
                )
            if missing_model_fk:
                op.create_foreign_key(
                    op.f("fk_crm_vehicles_model_id_crm_car_models"),
                    "crm_vehicles",
                    "crm_car_models",
                    ["model_id"],
                    ["id"],
                    ondelete="RESTRICT",
                )

    existing_codes = {row[0] for row in bind.execute(sa.text("SELECT code FROM crm_roles"))}
    missing_roles = []
    if "admin" not in existing_codes:
        missing_roles.append({"code": "admin", "name": "Admin"})
    if "employee" not in existing_codes:
        missing_roles.append({"code": "employee", "name": "Employee"})

    if missing_roles:
        crm_roles = sa.table(
            "crm_roles",
            sa.column("code", sa.String(length=32)),
            sa.column("name", sa.String(length=128)),
        )
        op.bulk_insert(crm_roles, missing_roles)


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM crm_roles WHERE code IN ('admin', 'employee')"))
    bind = op.get_bind()
    inspector = inspect(bind)

    brand_fk_name = _get_foreign_key_name(inspector, "crm_vehicles", ["brand_id"], "crm_car_brands")
    model_fk_name = _get_foreign_key_name(inspector, "crm_vehicles", ["model_id"], "crm_car_models")
    if model_fk_name or brand_fk_name:
        if _is_sqlite(bind):
            with op.batch_alter_table("crm_vehicles", recreate="always") as batch_op:
                if model_fk_name:
                    batch_op.drop_constraint(model_fk_name, type_="foreignkey")
                if brand_fk_name:
                    batch_op.drop_constraint(brand_fk_name, type_="foreignkey")
        else:
            if model_fk_name:
                op.drop_constraint(model_fk_name, "crm_vehicles", type_="foreignkey")
            if brand_fk_name:
                op.drop_constraint(brand_fk_name, "crm_vehicles", type_="foreignkey")

    vehicle_columns = _get_column_names(inspector, "crm_vehicles")
    if "mileage" in vehicle_columns:
        op.drop_column("crm_vehicles", "mileage")
    if "model_id" in vehicle_columns:
        op.drop_column("crm_vehicles", "model_id")
    if "brand_id" in vehicle_columns:
        op.drop_column("crm_vehicles", "brand_id")
    if _has_table(inspector, "crm_car_models"):
        op.drop_table("crm_car_models")
    if _has_table(inspector, "crm_car_brands"):
        op.drop_table("crm_car_brands")
    if "telegram_username" in _get_column_names(inspector, "crm_clients"):
        op.drop_column("crm_clients", "telegram_username")
