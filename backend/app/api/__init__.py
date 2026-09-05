"""Compatibility layer for legacy backend test imports.

The active CRM v2.0 API lives under ``app.crm.api``. Some tests and
transitional tooling still import ``app.api``. Re-export the current
modules here so the suite resolves the live routers and dependencies.
"""

from app.crm.api import deps, routers

__all__ = ["deps", "routers"]
