from __future__ import annotations

from pathlib import Path

from app.core.config import get_runtime_dir


class InspectionStorageService:
    def __init__(self) -> None:
        self.runtime_dir = get_runtime_dir()

    def get_root(self) -> Path:
        path = self.runtime_dir / "storage" / "inspection"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_session_dir(self, session_id: int) -> Path:
        path = self.get_root() / f"session-{session_id}"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_general_photos_dir(self, session_id: int) -> Path:
        path = self.get_session_dir(session_id) / "general-photos"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_mark_photos_dir(self, session_id: int, mark_id: int) -> Path:
        path = self.get_session_dir(session_id) / "marks" / f"mark-{mark_id}"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def get_exports_dir(self, session_id: int) -> Path:
        path = self.get_session_dir(session_id) / "exports"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def to_relative_path(self, path: Path) -> str:
        return str(path.relative_to(self.runtime_dir))

    def resolve(self, relative_path: str) -> Path:
        return self.runtime_dir / relative_path
