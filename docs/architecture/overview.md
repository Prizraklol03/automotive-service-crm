# Architecture overview

## Runtime shape

The current implementation is a web-first React client backed by a FastAPI application and PostgreSQL. The API is modular rather than a single CRUD router: transport, orchestration, persistence, security/privacy, and files have distinct boundaries.

```text
React feature modules
  -> typed HTTP client and TanStack Query
  -> FastAPI routers and request dependencies
  -> domain services
  -> SQLAlchemy repositories/models
  -> PostgreSQL

Domain services
  -> encryption/privacy helpers
  -> protected runtime storage
  -> DOCX/PDF and inspection rendering boundaries
```

## Domain coverage

The source includes orders, clients, vehicles and ownership history, inspections, documents, payments, finance, materials, reminders, notifications, users, permissions, settings, analytics, service catalogs, and generic inbound leads. Capabilities are assembled across model, schema, repository, service, router, and frontend feature layers.

## Deliberate portfolio boundaries

This snapshot does not contain deployment automation, production configuration, storage content, generated documents, document templates, a vehicle catalog dataset, native packaging code, private operational documentation, or historical Git objects. Those exclusions do not change the core application architecture; they remove environment-owned and rights-sensitive inputs.

See also:

- [Backend architecture](backend.md)
- [Frontend architecture](frontend.md)
- [Security and privacy](security-and-privacy.md)
- [Data model](data-model.md)
