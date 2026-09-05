from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from postgres_test_utils import create_empty_database_handle

SCRIPT_PATH = ROOT / "scripts" / "check_utf8.py"


def load_utf8_checker():
    spec = importlib.util.spec_from_file_location("check_utf8", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load UTF-8 guard from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class Utf8GuardTestCase(unittest.TestCase):
    def test_repository_has_no_utf8_or_mojibake_issues(self) -> None:
        checker = load_utf8_checker()
        result = checker.collect_issues(ROOT)

        invalid_details = "\n".join(f"{path}: {message}" for path, message in result.invalid_files)
        suspicious_details = "\n".join(
            f"{issue.path}:{issue.line_number} [{issue.reason}] {issue.line}" for issue in result.suspicious_lines
        )

        self.assertFalse(result.invalid_files, invalid_details)
        self.assertFalse(result.suspicious_lines, suspicious_details)

    def test_utf8_guard_does_not_flag_mojibake_db_utility_scripts(self) -> None:
        checker = load_utf8_checker()
        result = checker.collect_issues(ROOT)
        suspicious_paths = {
            issue.path.as_posix()
            for issue in result.suspicious_lines
            if issue.path.as_posix() in {"scripts/report_mojibake_db.py", "scripts/repair_mojibake_db.py"}
        }
        self.assertFalse(
            suspicious_paths,
            f"UTF-8 guard should not flag the mojibake DB utility scripts: {sorted(suspicious_paths)}",
        )

    def test_postgresql_database_encoding_is_utf8(self) -> None:
        handle = create_empty_database_handle()
        try:
            engine = create_engine(handle.database_url, future=True)
            try:
                with engine.connect() as connection:
                    server_encoding = connection.execute(text("show server_encoding")).scalar_one()
                    client_encoding = connection.execute(text("show client_encoding")).scalar_one()
            finally:
                engine.dispose()
        finally:
            handle.close()

        self.assertEqual(server_encoding.upper(), "UTF8")
        self.assertEqual(client_encoding.upper(), "UTF8")


if __name__ == "__main__":
    unittest.main()
