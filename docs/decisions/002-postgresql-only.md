# Decision 002: PostgreSQL-only persistence

## Status

Implemented.

## Decision

PostgreSQL is the supported runtime, migration, and database-backed test engine. SQLite is not used as a compatibility target.

## Rationale

The application relies on PostgreSQL behavior for production-relevant constraints, migrations, indexing, search, concurrency, and query semantics. A second database path would create misleading verification and schema drift.
