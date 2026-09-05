from __future__ import annotations

from datetime import date, datetime, timedelta, timezone, tzinfo
from functools import lru_cache
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

from app.core.config import get_settings

KRASNOYARSK_FALLBACK_TZ = timezone(timedelta(hours=7), name="UTC+7")


@lru_cache
def get_app_timezone() -> tzinfo:
    timezone_name = get_settings().app_timezone
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        if timezone_name == "Asia/Krasnoyarsk":
            return KRASNOYARSK_FALLBACK_TZ
        raise


def app_now_naive() -> datetime:
    return datetime.now(get_app_timezone()).replace(tzinfo=None)


def app_today() -> date:
    return app_now_naive().date()


def to_app_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(get_app_timezone()).replace(tzinfo=None)
