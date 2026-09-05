"""Drop unused runtime columns from CRM v2.0 tables."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0027_drop_unused_runtime_columns"
down_revision = "0026_auth_device_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_clients") as batch_op:
        batch_op.drop_column("deleted_by_id")

    with op.batch_alter_table("crm_vehicles") as batch_op:
        batch_op.drop_column("deleted_by_id")

    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.drop_column("archived_at")

    with op.batch_alter_table("crm_notes") as batch_op:
        batch_op.drop_column("number_text")


def downgrade() -> None:
    with op.batch_alter_table("crm_notes") as batch_op:
        batch_op.add_column(sa.Column("number_text", sa.String(length=32), nullable=False, server_default=""))

    with op.batch_alter_table("crm_orders") as batch_op:
        batch_op.add_column(sa.Column("archived_at", sa.DateTime(timezone=False), nullable=True))

    with op.batch_alter_table("crm_vehicles") as batch_op:
        batch_op.add_column(sa.Column("deleted_by_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_crm_vehicles_deleted_by_id_crm_users",
            "crm_users",
            ["deleted_by_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("crm_clients") as batch_op:
        batch_op.add_column(sa.Column("deleted_by_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_crm_clients_deleted_by_id_crm_users",
            "crm_users",
            ["deleted_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
