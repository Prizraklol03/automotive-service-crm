# Security and privacy architecture

## Authentication and sessions

The backend signs short-lived access tokens and persists refresh/device sessions server-side. Session records support rotation, revocation, inactivity/absolute expiration, and token-version checks. Password and token handling are centralized in security services. Login and refresh paths include configurable throttling.

## Authorization

The active roles are `admin` and `standard_user`. Standard-user behavior is refined by per-user permission overrides. FastAPI dependencies enforce route access, and selected domain services repeat permission checks for sensitive state transitions. Frontend guards are a navigation aid, not the trust boundary.

## Protected personal data

Privacy services provide encryption, normalization, keyed hashes/blind indexes, masking, and permission-sensitive projection. This allows selected lookup behavior without treating plaintext columns as a search index. Key identifiers are stored separately from secret material so rotations and mismatches can fail closed.

## Protected files

Document, inspection, photo, material, and expense attachment code keeps runtime bytes outside the source tree. Metadata and authorization remain in the application layer. Safe path resolution and encryption metadata reduce direct filesystem exposure.

## Limits of the snapshot

The repository contains implementation mechanisms, not a security certification. No production keys, key-management procedure, network controls, runtime storage, monitoring configuration, backup system, incident history, or real data are present. Operators must supply and review those controls independently.
