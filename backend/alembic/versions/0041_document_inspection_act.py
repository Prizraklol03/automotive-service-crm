"""extend document type enum with inspection act

Revision ID: 0041_document_inspection_act
Revises: 0040_inspections
Create Date: 2026-04-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0041_document_inspection_act"
down_revision = "0040_inspections"
branch_labels = None
depends_on = None


OLD_ENUM = sa.Enum(
    "preliminary_work_order",
    "work_order",
    "completion_act",
    name="crm_document_type_enum",
    native_enum=False,
)

NEW_ENUM = sa.Enum(
    "preliminary_work_order",
    "work_order",
    "completion_act",
    "inspection_act",
    name="crm_document_type_enum",
    native_enum=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        NEW_ENUM.create(bind, checkfirst=True)
        op.execute(
            "ALTER TABLE crm_document_templates ALTER COLUMN code TYPE VARCHAR(32)"
        )
        op.execute(
            "ALTER TABLE crm_documents ALTER COLUMN document_type TYPE VARCHAR(32)"
        )
        return

    with op.batch_alter_table("crm_document_templates") as batch_op:
        batch_op.alter_column("code", existing_type=OLD_ENUM, type_=NEW_ENUM, existing_nullable=False)

    with op.batch_alter_table("crm_documents") as batch_op:
        batch_op.alter_column("document_type", existing_type=OLD_ENUM, type_=NEW_ENUM, existing_nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DELETE FROM crm_documents WHERE document_type = 'inspection_act'")
        op.execute("DELETE FROM crm_document_templates WHERE code = 'inspection_act'")
        return

    with op.batch_alter_table("crm_documents") as batch_op:
        batch_op.alter_column("document_type", existing_type=NEW_ENUM, type_=OLD_ENUM, existing_nullable=False)

    with op.batch_alter_table("crm_document_templates") as batch_op:
        batch_op.alter_column("code", existing_type=NEW_ENUM, type_=OLD_ENUM, existing_nullable=False)
