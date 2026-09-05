from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker


DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://test_user:CHANGE_ME@127.0.0.1:5432/automotive_crm_test"
DEFAULT_TEST_ADMIN_DATABASE_URL = "postgresql+psycopg://postgres:CHANGE_ME@127.0.0.1:5432/postgres"


def get_postgres_test_url() -> str:
    database_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL") or DEFAULT_TEST_DATABASE_URL
    if database_url.startswith("sqlite"):
        raise RuntimeError("SQLite is no longer supported in backend tests. Configure a PostgreSQL test database.")
    return database_url


def get_postgres_test_admin_url() -> str:
    admin_url = os.getenv("TEST_ADMIN_DATABASE_URL")
    if admin_url:
        if admin_url.startswith("sqlite"):
            raise RuntimeError("SQLite is no longer supported in backend tests. Configure a PostgreSQL admin database URL.")
        return admin_url
    return _admin_database_url(get_postgres_test_url())


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _admin_database_url(database_url: str) -> str:
    url = make_url(database_url)
    return url.set(database="postgres").render_as_string(hide_password=False)


def _database_url(database_url: str, database_name: str) -> str:
    url = make_url(database_url).set(database=database_name)
    return url.render_as_string(hide_password=False)


def _redacted_url(database_url: str) -> str:
    return make_url(database_url).render_as_string(hide_password=True)


def _schema_engine(database_url: str, schema_name: str) -> Engine:
    engine = create_engine(database_url, future=True, pool_pre_ping=True)

    @event.listens_for(engine, "checkout")
    def set_search_path(dbapi_connection, _connection_record, _connection_proxy) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET search_path TO {_quote_identifier(schema_name)}")
        cursor.close()

    return engine


@dataclass
class PostgresSchemaHandle:
    schema_name: str
    management_engine: Engine
    database_url: str

    def close(self) -> None:
        with self.management_engine.connect() as connection:
            connection.execute(text(f"DROP SCHEMA IF EXISTS {_quote_identifier(self.schema_name)} CASCADE"))
        self.management_engine.dispose()


@dataclass
class PostgresSchemaHarness(PostgresSchemaHandle):
    engine: Engine
    SessionLocal: sessionmaker

    def close(self) -> None:
        self.engine.dispose()
        super().close()


def create_empty_schema_handle() -> PostgresSchemaHandle:
    database_url = get_postgres_test_url()
    schema_name = f"test_{uuid.uuid4().hex}"
    management_engine = create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
        isolation_level="AUTOCOMMIT",
    )
    try:
        with management_engine.connect() as connection:
            connection.execute(text(f"CREATE SCHEMA {_quote_identifier(schema_name)}"))
    except SQLAlchemyError as exc:
        management_engine.dispose()
        raise RuntimeError(
            f"PostgreSQL test database is unavailable at {database_url}. Start PostgreSQL before running tests."
        ) from exc

    return PostgresSchemaHandle(
        schema_name=schema_name,
        management_engine=management_engine,
        database_url=database_url,
    )


def create_schema_harness(*, metadata) -> PostgresSchemaHarness:
    schema_handle = create_empty_schema_handle()
    engine = _schema_engine(schema_handle.database_url, schema_handle.schema_name)
    metadata.create_all(engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return PostgresSchemaHarness(
        schema_name=schema_handle.schema_name,
        management_engine=schema_handle.management_engine,
        database_url=schema_handle.database_url,
        engine=engine,
        SessionLocal=session_local,
    )


@dataclass
class PostgresDatabaseHandle:
    database_name: str
    management_engine: Engine
    database_url: str

    def close(self) -> None:
        with self.management_engine.connect() as connection:
            connection.execute(
                text(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = :database_name
                      AND pid <> pg_backend_pid()
                    """
                ),
                {"database_name": self.database_name},
            )
            connection.execute(text(f"DROP DATABASE IF EXISTS {_quote_identifier(self.database_name)}"))
        self.management_engine.dispose()


def create_empty_database_handle() -> PostgresDatabaseHandle:
    database_url = get_postgres_test_url()
    database_name = f"test_{uuid.uuid4().hex}"
    management_engine = create_engine(
        get_postgres_test_admin_url(),
        future=True,
        pool_pre_ping=True,
        isolation_level="AUTOCOMMIT",
    )
    try:
        with management_engine.connect() as connection:
            connection.execute(text(f"CREATE DATABASE {_quote_identifier(database_name)}"))
    except SQLAlchemyError as exc:
        management_engine.dispose()
        raise RuntimeError(
            f"PostgreSQL admin database is unavailable at {_redacted_url(get_postgres_test_admin_url())}. Start PostgreSQL before running tests."
        ) from exc

    return PostgresDatabaseHandle(
        database_name=database_name,
        management_engine=management_engine,
        database_url=_database_url(database_url, database_name),
    )
