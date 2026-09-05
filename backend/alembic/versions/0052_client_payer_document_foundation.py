"""client and payer document foundation

Revision ID: 0052_client_payer_document_foundation
Revises: 0051_user_permissions
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0052_client_payer_document_foundation"
down_revision = "0051_user_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_clients",
        sa.Column("client_type", sa.String(length=16), nullable=False, server_default=sa.text("'individual'")),
    )
    op.add_column("crm_clients", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("crm_clients", sa.Column("company_name", sa.String(length=255), nullable=True))
    op.add_column("crm_clients", sa.Column("inn", sa.String(length=32), nullable=True))
    op.add_column("crm_clients", sa.Column("kpp", sa.String(length=32), nullable=True))
    op.add_column("crm_clients", sa.Column("ogrn", sa.String(length=32), nullable=True))
    op.add_column("crm_clients", sa.Column("legal_address", sa.Text(), nullable=True))
    op.add_column("crm_clients", sa.Column("actual_address", sa.Text(), nullable=True))
    op.add_column("crm_clients", sa.Column("representative_full_name", sa.String(length=255), nullable=True))
    op.add_column("crm_clients", sa.Column("representative_position", sa.String(length=255), nullable=True))
    op.add_column("crm_clients", sa.Column("representative_basis", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_crm_clients_client_type",
        "crm_clients",
        "client_type IN ('individual', 'legal')",
    )

    op.add_column("crm_orders", sa.Column("payer_client_id", sa.Integer(), nullable=True))
    op.create_index("ix_crm_orders_payer_client_id", "crm_orders", ["payer_client_id"], unique=False)
    op.create_foreign_key(
        "fk_crm_orders_payer_client_id_crm_clients",
        "crm_orders",
        "crm_clients",
        ["payer_client_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_crm_orders_payer_client_id_crm_clients", "crm_orders", type_="foreignkey")
    op.drop_index("ix_crm_orders_payer_client_id", table_name="crm_orders")
    op.drop_column("crm_orders", "payer_client_id")

    op.drop_constraint("ck_crm_clients_client_type", "crm_clients", type_="check")
    op.drop_column("crm_clients", "representative_basis")
    op.drop_column("crm_clients", "representative_position")
    op.drop_column("crm_clients", "representative_full_name")
    op.drop_column("crm_clients", "actual_address")
    op.drop_column("crm_clients", "legal_address")
    op.drop_column("crm_clients", "ogrn")
    op.drop_column("crm_clients", "kpp")
    op.drop_column("crm_clients", "inn")
    op.drop_column("crm_clients", "company_name")
    op.drop_column("crm_clients", "address")
    op.drop_column("crm_clients", "client_type")
