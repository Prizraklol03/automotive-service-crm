"""reseed canonical order statuses

Revision ID: 0046_canonical_order_statuses
Revises: 0045_documents_order_id_truth
Create Date: 2026-04-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0046_canonical_order_statuses"
down_revision = "0045_documents_order_id_truth"
branch_labels = None
depends_on = None


CANONICAL_STATUSES = (
    ("new", "\u041d\u043e\u0432\u044b\u0439", "new", "#6b7280", 10, True),
    ("in_progress", "\u0412 \u0440\u0430\u0431\u043e\u0442\u0435", "in_progress", "#2563eb", 20, False),
    ("done", "\u0413\u043e\u0442\u043e\u0432\u043e", "done", "#10b981", 30, False),
    ("closed", "\u0412\u044b\u0434\u0430\u043d", "closed", "#0f766e", 40, False),
    ("cancelled", "\u041e\u0442\u043c\u0435\u043d\u0451\u043d", "cancelled", "#ef4444", 50, False),
)

CANONICAL_SOURCE_PRIORITY = {
    "new": ("draft", "waiting"),
    "in_progress": ("in_progress", "postponed"),
    "done": ("done",),
    "closed": ("closed", "completed"),
    "cancelled": ("cancelled",),
}

LEGACY_STATUSES = (
    ("draft", "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a", "new", "#6b7280", 0, True),
    ("waiting", "\u041e\u0436\u0438\u0434\u0430\u0435\u0442", "new", "#f59e0b", 1, False),
    ("in_progress", "\u0412 \u0440\u0430\u0431\u043e\u0442\u0435", "in_progress", "#2563eb", 2, False),
    ("postponed", "\u041e\u0442\u043b\u043e\u0436\u0435\u043d", "in_progress", "#8b5cf6", 3, False),
    ("completed", "\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043d", "closed", "#10b981", 4, False),
    ("cancelled", "\u041e\u0442\u043c\u0435\u043d\u0451\u043d", "cancelled", "#ef4444", 5, False),
)

LEGACY_DEFAULT_SORT_ORDER = {code: sort_order for code, _display_name, _group, _color, sort_order, _is_default in LEGACY_STATUSES}


def _fetch_status_rows() -> dict[str, dict[str, object]]:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT code, display_name, status_group, color, sort_order, is_default
            FROM crm_order_statuses
            """
        )
    ).mappings()
    return {str(row["code"]): dict(row) for row in rows}


def _preferred_source_row(
    rows_by_code: dict[str, dict[str, object]],
    *,
    canonical_code: str,
) -> tuple[str, dict[str, object]] | None:
    candidates = [
        (code, rows_by_code[code])
        for code in CANONICAL_SOURCE_PRIORITY[canonical_code]
        if code in rows_by_code
    ]
    if not candidates:
        return None

    default_candidates = [(code, row) for code, row in candidates if bool(row["is_default"])]
    if default_candidates:
        return default_candidates[0]
    return candidates[0]


def _insert_canonical_rows_preserving_customizations() -> None:
    bind = op.get_bind()
    rows_by_code = _fetch_status_rows()

    for code, display_name, status_group, color, sort_order, is_default in CANONICAL_STATUSES:
        preferred_source = _preferred_source_row(rows_by_code, canonical_code=code)
        source_code: str | None = None
        source_row: dict[str, object] | None = None
        if preferred_source is not None:
            source_code, source_row = preferred_source

        source_sort_order = int(source_row["sort_order"]) if source_row else sort_order
        legacy_default_sort_order = LEGACY_DEFAULT_SORT_ORDER.get(source_code or "", source_sort_order)
        preserved_sort_order = source_sort_order if source_sort_order != legacy_default_sort_order else sort_order
        preserved_display_name = str(source_row["display_name"]) if source_row else display_name
        preserved_color = str(source_row["color"]) if source_row else color
        preserved_is_default = bool(source_row["is_default"]) if source_row else is_default

        if code in rows_by_code:
            bind.execute(
                sa.text(
                    """
                    UPDATE crm_order_statuses
                    SET display_name = :display_name,
                        status_group = :status_group,
                        color = :color,
                        sort_order = :sort_order,
                        is_default = :is_default
                    WHERE code = :code
                    """
                ),
                {
                    "code": code,
                    "display_name": preserved_display_name,
                    "status_group": status_group,
                    "color": preserved_color,
                    "sort_order": preserved_sort_order,
                    "is_default": preserved_is_default,
                },
            )
            continue

        bind.execute(
            sa.text(
                """
                INSERT INTO crm_order_statuses (code, display_name, status_group, color, sort_order, is_default)
                VALUES (:code, :display_name, :status_group, :color, :sort_order, :is_default)
                ON CONFLICT (code) DO NOTHING
                """
            ),
            {
                "code": code,
                "display_name": preserved_display_name,
                "status_group": status_group,
                "color": preserved_color,
                "sort_order": preserved_sort_order,
                "is_default": preserved_is_default,
            },
        )


def _overwrite_status_rows(rows: tuple[tuple[str, str, str, str, int, bool], ...]) -> None:
    """Upsert status rows, overwriting existing ones. Used only for downgrade."""
    bind = op.get_bind()
    for code, display_name, status_group, color, sort_order, is_default in rows:
        bind.execute(
            sa.text(
                """
                UPDATE crm_order_statuses
                SET display_name = :display_name,
                    status_group = :status_group,
                    color = :color,
                    sort_order = :sort_order,
                    is_default = :is_default
                WHERE code = :code
                """
            ),
            {
                "code": code,
                "display_name": display_name,
                "status_group": status_group,
                "color": color,
                "sort_order": sort_order,
                "is_default": is_default,
            },
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO crm_order_statuses (code, display_name, status_group, color, sort_order, is_default)
                VALUES (:code, :display_name, :status_group, :color, :sort_order, :is_default)
                ON CONFLICT (code) DO NOTHING
                """
            ),
            {
                "code": code,
                "display_name": display_name,
                "status_group": status_group,
                "color": color,
                "sort_order": sort_order,
                "is_default": is_default,
            },
        )


def upgrade() -> None:
    # Seed canonical rows first so the subsequent order status remap never points
    # at a status code that does not exist yet under PostgreSQL FK enforcement.
    _insert_canonical_rows_preserving_customizations()

    op.execute(
        """
        UPDATE crm_orders
        SET status = CASE status
            WHEN 'draft' THEN 'new'
            WHEN 'waiting' THEN 'new'
            WHEN 'postponed' THEN 'in_progress'
            WHEN 'completed' THEN 'closed'
            ELSE status
        END
        """
    )

    op.execute("DELETE FROM crm_order_statuses WHERE code IN ('draft', 'waiting', 'postponed', 'completed')")


def downgrade() -> None:
    _overwrite_status_rows(LEGACY_STATUSES)

    op.execute(
        """
        UPDATE crm_orders
        SET status = CASE status
            WHEN 'new' THEN 'draft'
            WHEN 'closed' THEN 'completed'
            WHEN 'done' THEN 'completed'
            ELSE status
        END
        """
    )

    op.execute("DELETE FROM crm_order_statuses WHERE code IN ('new', 'done', 'closed')")
