from __future__ import annotations

import uvicorn

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.main import app


def main() -> None:
    settings = get_settings()
    configure_logging()
    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        log_level=settings.log_level.lower(),
        log_config=None,
        use_colors=False,
    )


if __name__ == "__main__":
    main()
