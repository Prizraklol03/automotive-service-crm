# Decision 004: explicit vehicle ownership history

## Status

Implemented.

## Decision

Represent vehicle ownership changes with an explicit history model in addition to the current relationship used by operational screens.

## Rationale

Service history is attached to the vehicle, while customer relationships can change. Preserving ownership intervals avoids overwriting business history and supports auditable transfer behavior.
