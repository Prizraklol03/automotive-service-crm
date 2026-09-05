from __future__ import annotations

import sys
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfoNotFoundError
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.time import app_now_naive, get_app_timezone


class TimeFallbackTestCase(unittest.TestCase):
    def test_krasnoyarsk_timezone_falls_back_to_fixed_utc_plus_7(self) -> None:
        get_app_timezone.cache_clear()
        with patch("app.core.time.ZoneInfo", side_effect=ZoneInfoNotFoundError("Asia/Krasnoyarsk")):
            tz = get_app_timezone()
            now = app_now_naive()

        self.assertEqual(tz.utcoffset(None).total_seconds(), 7 * 3600)
        self.assertIsNone(now.tzinfo)
        get_app_timezone.cache_clear()
