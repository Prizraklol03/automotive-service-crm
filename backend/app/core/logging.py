from __future__ import annotations

import logging
import sys
from logging.config import dictConfig
from pathlib import Path

from app.core.config import get_runtime_dir, get_settings


def _has_usable_stream(stream: object) -> bool:
    return stream is not None and hasattr(stream, "write")


def _log_file_path() -> Path:
    logs_dir = get_runtime_dir() / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir / "backend.log"


def _safe_log_file_path() -> Path | None:
    try:
        return _log_file_path()
    except OSError:
        return None


def configure_logging() -> None:
    settings = get_settings()
    handlers: dict[str, dict[str, object]] = {}
    active_handlers: list[str] = []

    log_file_path = _safe_log_file_path()
    if log_file_path is not None:
        handlers["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "default",
            "filename": str(log_file_path),
            "maxBytes": 1_048_576,
            "backupCount": 3,
            "encoding": "utf-8",
        }
        active_handlers.append("file")

    if _has_usable_stream(sys.stderr):
        handlers["console"] = {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stderr",
        }
        active_handlers.append("console")

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                }
            },
            "handlers": handlers,
            "root": {
                "level": settings.log_level.upper(),
                "handlers": active_handlers,
            },
            "loggers": {
                "uvicorn": {
                    "level": settings.log_level.upper(),
                    "handlers": active_handlers,
                    "propagate": False,
                },
                "uvicorn.error": {
                    "level": settings.log_level.upper(),
                    "handlers": active_handlers,
                    "propagate": False,
                },
                "uvicorn.access": {
                    "level": settings.log_level.upper(),
                    "handlers": active_handlers,
                    "propagate": False,
                },
                "httpx": {
                    "level": "WARNING",
                    "handlers": active_handlers,
                    "propagate": False,
                },
            },
        }
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
