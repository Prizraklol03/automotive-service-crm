"""Add CRM document and settings foundation."""

from alembic import op
import sqlalchemy as sa


revision = "0007_crm_stage3_documents"
down_revision = "0006_crm_stage1a_corrections"
branch_labels = None
depends_on = None


document_type_enum = sa.Enum(
    "preliminary_work_order",
    "work_order",
    "completion_act",
    name="crm_document_type_enum",
    native_enum=False,
)


def upgrade() -> None:
    document_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "crm_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_settings")),
        sa.UniqueConstraint("key", name=op.f("uq_crm_settings_key")),
    )
    op.create_table(
        "crm_document_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", document_type_enum, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_document_templates")),
        sa.UniqueConstraint("code", name=op.f("uq_crm_document_templates_code")),
    )
    op.create_table(
        "crm_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("document_type", document_type_enum, nullable=False),
        sa.Column("document_number", sa.Integer(), nullable=False),
        sa.Column("storage_docx_path", sa.String(length=1024), nullable=True),
        sa.Column("storage_pdf_path", sa.String(length=1024), nullable=True),
        sa.Column("last_rendered_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["crm_users.id"], name=op.f("fk_crm_documents_created_by_user_id_crm_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["crm_orders.id"], name=op.f("fk_crm_documents_order_id_crm_orders"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["template_id"], ["crm_document_templates.id"], name=op.f("fk_crm_documents_template_id_crm_document_templates"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_documents")),
        sa.UniqueConstraint("document_number", name=op.f("uq_crm_documents_document_number")),
    )

    crm_settings = sa.table(
        "crm_settings",
        sa.column("key", sa.String(length=128)),
        sa.column("value", sa.Text()),
    )
    op.bulk_insert(crm_settings, [{"key": "next_document_number", "value": "1"}])


def downgrade() -> None:
    op.drop_table("crm_documents")
    op.drop_table("crm_document_templates")
    op.drop_table("crm_settings")
    document_type_enum.drop(op.get_bind(), checkfirst=True)
