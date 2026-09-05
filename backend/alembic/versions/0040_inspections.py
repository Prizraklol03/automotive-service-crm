"""inspection sessions and exports

Revision ID: 0040_inspections
Revises: 0039
Create Date: 2026-04-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0040_inspections"
down_revision = "0039"
branch_labels = None
depends_on = None


def _json_type() -> sa.types.TypeEngine:
    from sqlalchemy.dialects import postgresql

    try:
        from alembic import context

        dialect = context.get_context().dialect
        if dialect.name == "postgresql":
            return postgresql.JSONB(astext_type=sa.Text())
    except Exception:
        pass
    return sa.JSON()


def upgrade() -> None:
    op.create_table(
        "inspection_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("crm_vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("general_comment", sa.Text(), nullable=True),
        sa.Column("checklist_json", _json_type(), nullable=True),
        sa.Column("snapshot_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("export_front_image_path", sa.String(length=1024), nullable=True),
        sa.Column("export_rear_image_path", sa.String(length=1024), nullable=True),
        sa.Column("export_left_image_path", sa.String(length=1024), nullable=True),
        sa.Column("export_right_image_path", sa.String(length=1024), nullable=True),
        sa.Column("export_top_image_path", sa.String(length=1024), nullable=True),
        sa.Column("export_interior_image_path", sa.String(length=1024), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inspection_sessions_order_id", "inspection_sessions", ["order_id"])
    op.create_index("ix_inspection_sessions_vehicle_id", "inspection_sessions", ["vehicle_id"])

    op.create_table(
        "inspection_marks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("inspection_session_id", sa.Integer(), sa.ForeignKey("inspection_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("crm_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("crm_vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("view_type", sa.String(length=32), nullable=False),
        sa.Column("zone_key", sa.String(length=64), nullable=True),
        sa.Column("geometry_type", sa.String(length=32), nullable=False),
        sa.Column("geometry_data", _json_type(), nullable=False),
        sa.Column("defect_type", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inspection_marks_inspection_session_id", "inspection_marks", ["inspection_session_id"])
    op.create_index("ix_inspection_marks_order_id", "inspection_marks", ["order_id"])
    op.create_index("ix_inspection_marks_vehicle_id", "inspection_marks", ["vehicle_id"])

    op.create_table(
        "inspection_mark_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("inspection_mark_id", sa.Integer(), sa.ForeignKey("inspection_marks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(length=1024), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inspection_mark_photos_inspection_mark_id", "inspection_mark_photos", ["inspection_mark_id"])

    op.create_table(
        "inspection_general_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("inspection_session_id", sa.Integer(), sa.ForeignKey("inspection_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(length=1024), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inspection_general_photos_inspection_session_id", "inspection_general_photos", ["inspection_session_id"])

    op.create_table(
        "inspection_exports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("inspection_session_id", sa.Integer(), sa.ForeignKey("inspection_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("crm_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("snapshot_json", _json_type(), nullable=False),
        sa.Column("export_payload_json", _json_type(), nullable=False),
        sa.Column("docx_path", sa.String(length=1024), nullable=True),
        sa.Column("pdf_path", sa.String(length=1024), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("crm_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("document_id", name="uq_inspection_exports_document_id"),
    )
    op.create_index("ix_inspection_exports_inspection_session_id", "inspection_exports", ["inspection_session_id"])


def downgrade() -> None:
    op.drop_index("ix_inspection_exports_inspection_session_id", table_name="inspection_exports")
    op.drop_table("inspection_exports")

    op.drop_index("ix_inspection_general_photos_inspection_session_id", table_name="inspection_general_photos")
    op.drop_table("inspection_general_photos")

    op.drop_index("ix_inspection_mark_photos_inspection_mark_id", table_name="inspection_mark_photos")
    op.drop_table("inspection_mark_photos")

    op.drop_index("ix_inspection_marks_vehicle_id", table_name="inspection_marks")
    op.drop_index("ix_inspection_marks_order_id", table_name="inspection_marks")
    op.drop_index("ix_inspection_marks_inspection_session_id", table_name="inspection_marks")
    op.drop_table("inspection_marks")

    op.drop_index("ix_inspection_sessions_vehicle_id", table_name="inspection_sessions")
    op.drop_index("ix_inspection_sessions_order_id", table_name="inspection_sessions")
    op.drop_table("inspection_sessions")
