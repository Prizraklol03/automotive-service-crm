"""add vehicle catalog sync metadata to car references"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0009_vehicle_catalog_sync_metadata"
down_revision = "0008_crm_stage4_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_car_brands") as batch_op:
        batch_op.add_column(sa.Column("normalized_name", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("source_name", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("source_brand_id", sa.String(length=64), nullable=True))
        batch_op.create_index("ix_crm_car_brands_normalized_name", ["normalized_name"], unique=False)
        batch_op.create_index("ix_crm_car_brands_source_name", ["source_name"], unique=False)
        batch_op.create_index("ix_crm_car_brands_source_brand_id", ["source_brand_id"], unique=False)

    with op.batch_alter_table("crm_car_models") as batch_op:
        batch_op.add_column(sa.Column("normalized_name", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("source_name", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("source_model_id", sa.String(length=64), nullable=True))
        batch_op.create_index("ix_crm_car_models_normalized_name", ["normalized_name"], unique=False)
        batch_op.create_index("ix_crm_car_models_source_name", ["source_name"], unique=False)
        batch_op.create_index("ix_crm_car_models_source_model_id", ["source_model_id"], unique=False)

    op.execute("UPDATE crm_car_brands SET normalized_name = lower(trim(name)) WHERE normalized_name IS NULL AND name IS NOT NULL")
    op.execute("UPDATE crm_car_models SET normalized_name = lower(trim(name)) WHERE normalized_name IS NULL AND name IS NOT NULL")


def downgrade() -> None:
    with op.batch_alter_table("crm_car_models") as batch_op:
        batch_op.drop_index("ix_crm_car_models_source_model_id")
        batch_op.drop_index("ix_crm_car_models_source_name")
        batch_op.drop_index("ix_crm_car_models_normalized_name")
        batch_op.drop_column("source_model_id")
        batch_op.drop_column("source_name")
        batch_op.drop_column("normalized_name")

    with op.batch_alter_table("crm_car_brands") as batch_op:
        batch_op.drop_index("ix_crm_car_brands_source_brand_id")
        batch_op.drop_index("ix_crm_car_brands_source_name")
        batch_op.drop_index("ix_crm_car_brands_normalized_name")
        batch_op.drop_column("source_brand_id")
        batch_op.drop_column("source_name")
        batch_op.drop_column("normalized_name")
