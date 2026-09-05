# Backend architecture

## Layers

- `app/api` provides shared health and public-photo boundaries.
- `app/crm/api/routers` maps HTTP requests to domain operations and declares authentication/permission dependencies.
- `app/crm/schemas` owns request and response validation with Pydantic v2.
- `app/crm/services` coordinates transactions, business rules, file handling, rendering, analytics, privacy, and cross-entity workflows.
- `app/crm/repositories` centralizes SQLAlchemy query and persistence behavior.
- `app/crm/models` defines the PostgreSQL-backed domain model.
- `app/core` contains configuration validation, cryptography, privacy helpers, security, errors, logging, path safety, time, and request context.

Routers do not serve as the primary business-rule container. Sensitive checks also appear below the transport layer where a service can be called from more than one route.

## Persistence and transactions

The implementation uses SQLAlchemy 2.x and PostgreSQL-only runtime policy. Repository methods build reusable queries; services decide when related records, histories, totals, and audit effects must be coordinated. Alembic migrations are the canonical schema evolution path.

## Files and documents

File-backed features keep metadata in PostgreSQL and bytes in a protected runtime directory. Path-containment helpers reduce traversal risk, while the service layer applies authorization and encryption behavior. Document records remain live; generated versions are deployment/runtime artifacts and therefore absent from the public tree.

## Integrations

Inbound leads are modeled as authenticated integration sources with independent credentials, validation, request-size/rate controls, and deduplication. The public snapshot uses no vendor-specific domain, identifier, key, or operational handoff.
