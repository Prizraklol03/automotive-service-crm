# Data model

The PostgreSQL model is organized around several related clusters:

- identity: users, roles, permission overrides, preferences, refresh/device sessions;
- customer history: clients, vehicles, current ownership, append-oriented vehicle ownership history;
- work management: orders, status history, services, payments, materials, notes, reminders, custom fields, and presets;
- evidence and files: inspection sessions/marks, order photos, documents/templates, material attachments, finance attachments;
- finance and reporting: finance categories, expenses, payment data, analytics queries;
- configuration and integration: settings, service/vehicle catalogs, aliases, integration sources, inbound leads, audit records.

Schema changes are represented by Alembic revisions in `backend/alembic/versions`. The migration chain is included to show actual evolution rather than a generated final-schema dump. Applying the chain requires an isolated PostgreSQL database and is intentionally not part of portfolio preparation.
