from __future__ import annotations

from alembic import command
from alembic.config import Config

from app.core.config import get_backend_root


_migrations_ran = False


def run_migrations() -> None:
    global _migrations_ran
    if _migrations_ran:
        return

    backend_root = get_backend_root()
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "alembic"))
    config.attributes["skip_logging_config"] = True
    command.upgrade(config, "head")
    _migrations_ran = True
