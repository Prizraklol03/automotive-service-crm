from __future__ import annotations

from alembic.ddl.impl import DefaultImpl
from sqlalchemy import Column, MetaData, PrimaryKeyConstraint, String, Table


ALEMBIC_VERSION_NUM_LENGTH = 128


def patch_alembic_version_table_impl() -> None:
    if getattr(DefaultImpl.version_table_impl, "__name__", "") == "_crm_version_table_impl":
        return

    def _crm_version_table_impl(
        self,
        *,
        version_table: str,
        version_table_schema: str | None,
        version_table_pk: bool,
        **kw,
    ) -> Table:
        table = Table(
            version_table,
            MetaData(),
            Column("version_num", String(ALEMBIC_VERSION_NUM_LENGTH), nullable=False),
            schema=version_table_schema,
        )
        if version_table_pk:
            table.append_constraint(PrimaryKeyConstraint("version_num", name=f"{version_table}_pkc"))
        return table

    DefaultImpl.version_table_impl = _crm_version_table_impl
