from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


def normalize_page_args(page: int | None = None, page_size: int | None = None) -> tuple[int, int, int]:
    normalized_page = max(page or 1, 1)
    normalized_page_size = max(1, min(page_size or DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
    offset = (normalized_page - 1) * normalized_page_size
    return normalized_page, normalized_page_size, offset


def paginate_scalars(session: Session, statement, *, page: int | None = None, page_size: int | None = None):
    normalized_page, normalized_page_size, offset = normalize_page_args(page, page_size)
    total = session.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    items = list(session.scalars(statement.offset(offset).limit(normalized_page_size)).unique())
    return items, int(total), normalized_page, normalized_page_size
