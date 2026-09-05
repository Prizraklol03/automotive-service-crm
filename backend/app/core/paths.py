from __future__ import annotations

from pathlib import Path


def resolve_path_within_root(root: Path, candidate: str | Path) -> Path | None:
    """Resolve a storage path only when it remains below the configured root."""
    raw_path = Path(candidate)
    if ".." in raw_path.parts:
        return None

    resolved_root = root.resolve()
    resolved_candidate = (raw_path if raw_path.is_absolute() else resolved_root / raw_path).resolve()
    try:
        resolved_candidate.relative_to(resolved_root)
    except ValueError:
        return None
    return resolved_candidate
