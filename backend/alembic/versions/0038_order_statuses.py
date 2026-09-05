"""add order statuses table and migrate order.status to FK

Revision ID: 0038_order_statuses
Revises: 0037_order_photos
Create Date: 2026-04-12 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0038_order_statuses"
down_revision = "0037_order_photos"
branch_labels = None
depends_on = None

# Дефолтные статусы — коды совпадают с прежними значениями enum,
# чтобы существующие заказы не потеряли свой статус.
DEFAULT_STATUSES = [
    ("draft",       "Черновик",   "new",         "#6366f1", 0, True),
    ("waiting",     "Ожидание",   "new",         "#f59e0b", 1, False),
    ("in_progress", "В работе",   "in_progress", "#3b82f6", 2, False),
    ("postponed",   "Отложен",    "in_progress", "#8b5cf6", 3, False),
    ("completed",   "Выполнено",  "closed",      "#10b981", 4, False),
    ("cancelled",   "Отменён",    "cancelled",   "#ef4444", 5, False),
]


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # ── 1. Создаём таблицу статусов ──────────────────────────────────────────
    op.create_table(
        "crm_order_statuses",
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("status_group", sa.String(32), nullable=False),
        sa.Column("color", sa.String(32), nullable=False, server_default="#6b7280"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── 2. Засеваем дефолтные статусы ────────────────────────────────────────
    conn.execute(
        sa.text(
            "INSERT INTO crm_order_statuses (code, display_name, status_group, color, sort_order, is_default) "
            "VALUES (:code, :display_name, :status_group, :color, :sort_order, :is_default)"
        ),
        [
            {
                "code": code,
                "display_name": display_name,
                "status_group": status_group,
                "color": color,
                "sort_order": sort_order,
                "is_default": is_default,
            }
            for code, display_name, status_group, color, sort_order, is_default in DEFAULT_STATUSES
        ],
    )

    # ── 3. Меняем crm_orders.status с Enum на VARCHAR + FK ───────────────────
    if dialect == "postgresql":
        # PostgreSQL: конвертируем enum-тип в varchar
        op.execute(
            "ALTER TABLE crm_orders ALTER COLUMN status TYPE VARCHAR(64) USING status::VARCHAR"
        )
        op.create_foreign_key(
            "fk_crm_orders_status_crm_order_statuses",
            "crm_orders",
            "crm_order_statuses",
            ["status"],
            ["code"],
            ondelete="RESTRICT",
        )
    else:
        # SQLite: используем batch mode для пересоздания таблицы с FK
        with op.batch_alter_table("crm_orders", schema=None) as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=sa.String(32),
                type_=sa.String(64),
                existing_nullable=False,
            )
            batch_op.create_foreign_key(
                "fk_crm_orders_status_crm_order_statuses",
                "crm_order_statuses",
                ["status"],
                ["code"],
            )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == "postgresql":
        op.drop_constraint("fk_crm_orders_status_crm_order_statuses", "crm_orders", type_="foreignkey")
        op.execute(
            "ALTER TABLE crm_orders ALTER COLUMN status TYPE VARCHAR(32) USING status::VARCHAR"
        )
    else:
        with op.batch_alter_table("crm_orders", schema=None) as batch_op:
            batch_op.drop_constraint("fk_crm_orders_status_crm_order_statuses", type_="foreignkey")
            batch_op.alter_column(
                "status",
                existing_type=sa.String(64),
                type_=sa.String(32),
                existing_nullable=False,
            )

    op.drop_table("crm_order_statuses")
