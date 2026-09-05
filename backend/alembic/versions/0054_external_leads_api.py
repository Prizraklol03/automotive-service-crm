"""external leads api

Revision ID: 0054_external_leads_api
Revises: 0053_finance_expense_attachments
Create Date: 2026-06-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0054_external_leads_api"
down_revision = "0053_finance_expense_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_integration_sources",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False, server_default="website"),
        sa.Column("api_key_hash", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allowed_domains", sa.JSON(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_table(
        "crm_external_lead_submissions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "integration_source_id",
            sa.Integer(),
            sa.ForeignKey("crm_integration_sources.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("crm_clients.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("phone_normalized", sa.String(length=32), nullable=False),
        sa.Column("customer_name", sa.String(length=255), nullable=True),
        sa.Column("customer_phone_raw", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column("dedupe_status", sa.String(length=32), nullable=False, server_default="unique"),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("source_name", sa.String(length=255), nullable=True),
        sa.Column("page_url", sa.Text(), nullable=True),
        sa.Column("source_block", sa.String(length=128), nullable=True),
        sa.Column("form_name", sa.String(length=128), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("service_name", sa.String(length=255), nullable=True),
        sa.Column("package_name", sa.String(length=255), nullable=True),
        sa.Column("utm_source", sa.String(length=255), nullable=True),
        sa.Column("utm_medium", sa.String(length=255), nullable=True),
        sa.Column("utm_campaign", sa.String(length=255), nullable=True),
        sa.Column("utm_content", sa.String(length=255), nullable=True),
        sa.Column("utm_term", sa.String(length=255), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_order_id", sa.Integer(), sa.ForeignKey("crm_orders.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("duplicate_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_duplicate_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_table(
        "crm_external_lead_payload_logs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "integration_source_id",
            sa.Integer(),
            sa.ForeignKey("crm_integration_sources.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "external_lead_id",
            sa.Integer(),
            sa.ForeignKey("crm_external_lead_submissions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error", sa.String(length=64), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_index("ix_crm_external_lead_submissions_integration_source_id", "crm_external_lead_submissions", ["integration_source_id"])
    op.create_index("ix_crm_external_lead_submissions_client_id", "crm_external_lead_submissions", ["client_id"])
    op.create_index("ix_crm_external_lead_submissions_phone_normalized", "crm_external_lead_submissions", ["phone_normalized"])
    op.create_index("ix_crm_external_lead_submissions_created_order_id", "crm_external_lead_submissions", ["created_order_id"])
    op.create_index(
        "ix_crm_external_lead_submissions_dedupe_lookup",
        "crm_external_lead_submissions",
        ["integration_source_id", "phone_normalized", "form_name", "created_at"],
    )
    op.create_index("ix_crm_external_lead_payload_logs_integration_source_id", "crm_external_lead_payload_logs", ["integration_source_id"])
    op.create_index("ix_crm_external_lead_payload_logs_external_lead_id", "crm_external_lead_payload_logs", ["external_lead_id"])


def downgrade() -> None:
    op.drop_index("ix_crm_external_lead_payload_logs_external_lead_id", table_name="crm_external_lead_payload_logs")
    op.drop_index("ix_crm_external_lead_payload_logs_integration_source_id", table_name="crm_external_lead_payload_logs")
    op.drop_index("ix_crm_external_lead_submissions_dedupe_lookup", table_name="crm_external_lead_submissions")
    op.drop_index("ix_crm_external_lead_submissions_created_order_id", table_name="crm_external_lead_submissions")
    op.drop_index("ix_crm_external_lead_submissions_phone_normalized", table_name="crm_external_lead_submissions")
    op.drop_index("ix_crm_external_lead_submissions_client_id", table_name="crm_external_lead_submissions")
    op.drop_index("ix_crm_external_lead_submissions_integration_source_id", table_name="crm_external_lead_submissions")
    op.drop_table("crm_external_lead_payload_logs")
    op.drop_table("crm_external_lead_submissions")
    op.drop_table("crm_integration_sources")
