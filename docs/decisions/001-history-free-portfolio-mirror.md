# Decision 001: history-free portfolio mirror

## Status

Accepted for this public snapshot.

## Decision

Build the portfolio repository from an explicit current-tree allowlist and initialize a new Git repository only after sanitization. Do not copy or rewrite the private repository's Git history.

## Rationale

The private history contains environment-specific and generated artifacts that have no portfolio value and may retain sensitive information even after deletion from the working tree. A fresh repository creates a reviewable publication boundary.
