from __future__ import annotations

import os

from app.core.config import get_settings


def pytest_configure() -> None:
    os.environ.setdefault("CRM_DATA_ENCRYPTION_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    os.environ.setdefault("CRM_DATA_HASH_KEY", "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=")
    os.environ.setdefault("CRM_FILE_ENCRYPTION_KEY", "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=")
    os.environ.setdefault("CRM_INSECURE_HTTP_ALLOWED", "true")
    get_settings.cache_clear()
