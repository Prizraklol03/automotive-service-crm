from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_bundle_root, get_settings
from app.core.logging import get_logger
from app.crm.models.car_brand import CrmCarBrand
from app.crm.models.car_model import CrmCarModel
from app.crm.schemas.reference_catalog import CarBrandRead, CarModelRead


logger = get_logger(__name__)


def _resolve_bundle_path() -> Path:
    settings = get_settings()
    candidate = Path(settings.vehicle_catalog_bundle_path)
    if not candidate.is_absolute():
        candidate = get_bundle_root() / candidate
    return candidate.resolve()


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        lookup_key = normalized.casefold()
        if lookup_key in seen:
            continue
        seen.add(lookup_key)
        result.append(normalized)
    return result


def _collect_aliases(payload: dict[str, Any]) -> list[str]:
    aliases: list[str] = []
    for field_name in ("display_name", "name_en", "name_ru"):
        value = payload.get(field_name)
        if isinstance(value, str):
            aliases.append(value)

    for alias_payload in payload.get("aliases", []):
        alias = alias_payload.get("alias")
        if isinstance(alias, str):
            aliases.append(alias)

    return _dedupe_strings(aliases)


@lru_cache(maxsize=1)
def _load_alias_index() -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    bundle_path = _resolve_bundle_path()
    if not bundle_path.exists():
        logger.warning("Vehicle catalog alias bundle not found at %s", bundle_path)
        return {}, {}

    try:
        payload = json.loads(bundle_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.exception("Failed to read vehicle catalog alias bundle from %s", bundle_path)
        return {}, {}

    brand_aliases_by_source_id: dict[str, list[str]] = {}
    model_aliases_by_source_id: dict[str, list[str]] = {}

    for brand_payload in payload.get("brands", []):
        brand_slug = str(brand_payload.get("slug") or "").strip()
        if not brand_slug:
            continue

        brand_aliases_by_source_id[brand_slug] = _collect_aliases(brand_payload)

        for model_payload in brand_payload.get("models", []):
            model_slug = str(model_payload.get("slug") or "").strip()
            if not model_slug:
                continue
            source_model_id = f"{brand_slug}:{model_slug}"
            model_aliases_by_source_id[source_model_id] = _collect_aliases(model_payload)

    return brand_aliases_by_source_id, model_aliases_by_source_id


def clear_vehicle_catalog_alias_cache() -> None:
    _load_alias_index.cache_clear()


def get_brand_aliases(source_brand_id: str | None) -> list[str]:
    if not source_brand_id:
        return []
    brand_aliases_by_source_id, _ = _load_alias_index()
    return list(brand_aliases_by_source_id.get(source_brand_id, []))


def get_model_aliases(source_model_id: str | None) -> list[str]:
    if not source_model_id:
        return []
    _, model_aliases_by_source_id = _load_alias_index()
    return list(model_aliases_by_source_id.get(source_model_id, []))


def build_car_brand_read(brand: CrmCarBrand) -> CarBrandRead:
    return CarBrandRead.model_validate(
        {
            "id": brand.id,
            "name": brand.name,
            "aliases": get_brand_aliases(brand.source_brand_id),
            "sort_order": brand.sort_order,
            "is_active": brand.is_active,
        }
    )


def build_car_model_read(model: CrmCarModel) -> CarModelRead:
    return CarModelRead.model_validate(
        {
            "id": model.id,
            "brand_id": model.brand_id,
            "name": model.name,
            "aliases": get_model_aliases(model.source_model_id),
            "sort_order": model.sort_order,
            "is_active": model.is_active,
        }
    )
