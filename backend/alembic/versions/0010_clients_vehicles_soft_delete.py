"""add soft delete fields for clients and vehicles"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0010_clients_vehicles_soft_delete"
down_revision = "0009_vehicle_catalog_sync_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_clients") as batch_op:
        batch_op.add_column(sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(timezone=False), nullable=True))
        batch_op.add_column(sa.Column("deleted_by_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_crm_clients_deleted_by_id_crm_users", "crm_users", ["deleted_by_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_crm_clients_is_deleted", ["is_deleted"], unique=False)

    with op.batch_alter_table("crm_vehicles") as batch_op:
        batch_op.add_column(sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(timezone=False), nullable=True))
        batch_op.add_column(sa.Column("deleted_by_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_crm_vehicles_deleted_by_id_crm_users", "crm_users", ["deleted_by_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index("ix_crm_vehicles_is_deleted", ["is_deleted"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("crm_vehicles") as batch_op:
        batch_op.drop_index("ix_crm_vehicles_is_deleted")
        batch_op.drop_constraint("fk_crm_vehicles_deleted_by_id_crm_users", type_="foreignkey")
        batch_op.drop_column("deleted_by_id")
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("is_deleted")

    with op.batch_alter_table("crm_clients") as batch_op:
        batch_op.drop_index("ix_crm_clients_is_deleted")
        batch_op.drop_constraint("fk_crm_clients_deleted_by_id_crm_users", type_="foreignkey")
        batch_op.drop_column("deleted_by_id")
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("is_deleted")
