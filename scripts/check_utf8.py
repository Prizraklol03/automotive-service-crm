from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXTENSIONS = {
    ".bat",
    ".cjs",
    ".cfg",
    ".css",
    ".csv",
    ".env",
    ".html",
    ".htm",
    ".ini",
    ".js",
    ".json",
    ".jsonc",
    ".md",
    ".mjs",
    ".ps1",
    ".py",
    ".pyi",
    ".scss",
    ".sh",
    ".sql",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
SKIP_DIRS = {
    ".git",
    ".idea",
    ".pytest_cache",
    ".venv",
    ".vscode",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}
SPECIAL_FILENAMES = {
    ".dockerignore",
    ".editorconfig",
    ".env",
    ".env.example",
    ".gitattributes",
    ".gitignore",
}
MOJIBAKE_RE = re.compile(r"(?:[РС][^\x00-\x7F\s]){2,}|Ð|Ñ|�")
QUESTION_STRING_RE = re.compile(r"""(?:[furbFURB]{0,2})?(['"])(?:[^\\\n]|\\.)*\?{3,}(?:[^\\\n]|\\.)*\1""")
WHITELISTED_HISTORICAL_FILES: set[str] = set()


@dataclass(frozen=True)
class SuspiciousLine:
    path: Path
    line_number: int
    line: str
    reason: str


@dataclass(frozen=True)
class Utf8CheckResult:
    invalid_files: tuple[tuple[Path, str], ...]
    suspicious_lines: tuple[SuspiciousLine, ...]

    @property
    def is_clean(self) -> bool:
        return not self.invalid_files and not self.suspicious_lines


def should_check(path: Path) -> bool:
    if not path.is_file():
        return False
    if any(part in SKIP_DIRS for part in path.parts):
        return False
    if path.name in WHITELISTED_HISTORICAL_FILES:
        return False
    return path.suffix.lower() in TEXT_EXTENSIONS or path.name in SPECIAL_FILENAMES


def iter_paths(root: Path) -> list[Path]:
    try:
        completed = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return [path for path in root.rglob("*") if should_check(path)]

    paths: list[Path] = []
    for relative_path in completed.stdout.splitlines():
        path = root / relative_path
        if should_check(path):
            paths.append(path)
    return paths


def collect_issues(root: Path = ROOT) -> Utf8CheckResult:
    invalid_files: list[tuple[Path, str]] = []
    suspicious_lines: list[SuspiciousLine] = []

    for path in iter_paths(root):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            invalid_files.append((path.relative_to(root), str(exc)))
            continue

        for line_number, line in enumerate(text.splitlines(), 1):
            if path.name == "check_utf8.py" and "MOJIBAKE_RE =" in line:
                continue
            if MOJIBAKE_RE.search(line):
                suspicious_lines.append(
                    SuspiciousLine(
                        path=path.relative_to(root),
                        line_number=line_number,
                        line=line.strip(),
                        reason="possible mojibake sequence",
                    )
                )
            elif QUESTION_STRING_RE.search(line):
                suspicious_lines.append(
                    SuspiciousLine(
                        path=path.relative_to(root),
                        line_number=line_number,
                        line=line.strip(),
                        reason="quoted string contains repeated '?' placeholders",
                    )
                )

    return Utf8CheckResult(
        invalid_files=tuple(invalid_files),
        suspicious_lines=tuple(suspicious_lines),
    )


def main() -> int:
    result = collect_issues(ROOT)

    if result.invalid_files:
        print("Non-UTF-8 files found:", file=sys.stderr)
        for path, message in result.invalid_files:
            print(f"- {path}: {message}", file=sys.stderr)

    if result.suspicious_lines:
        print("Suspicious text patterns found:", file=sys.stderr)
        for issue in result.suspicious_lines:
            print(
                f"- {issue.path}:{issue.line_number}: {issue.reason}: {issue.line}",
                file=sys.stderr,
            )

    if not result.is_clean:
        return 1

    print("All checked version-controlled and candidate text files are valid UTF-8 and free of common mojibake markers.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
