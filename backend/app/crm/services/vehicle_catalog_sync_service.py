from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_bundle_root, get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.crm.models.car_brand import CrmCarBrand
from app.crm.models.car_model import CrmCarModel
from app.crm.models.setting import CrmSetting
from app.crm.models.vehicle import CrmVehicle
from app.crm.repositories.car_brand_repository import CarBrandRepository
from app.crm.repositories.car_model_repository import CarModelRepository
from app.crm.repositories.setting_repository import SettingRepository
from app.crm.utils.normalization import canonicalize_reference_name, normalize_reference_lookup_key


logger = get_logger(__name__)


@dataclass(slots=True)
class VehicleCatalogModelRecord:
    source_model_id: str
    name: str


@dataclass(slots=True)
class VehicleCatalogBrandRecord:
    source_brand_id: str
    name: str
    models: list[VehicleCatalogModelRecord]


@dataclass(slots=True)
class VehicleCatalogSyncResult:
    provider: str
    mode: str
    dry_run: bool
    started_at: str
    completed_at: str
    brands_added: int = 0
    brands_updated: int = 0
    brands_skipped: int = 0
    brands_deleted: int = 0
    models_added: int = 0
    models_updated: int = 0
    models_skipped: int = 0
    models_deleted: int = 0
    vehicles_detached: int = 0
    fetch_errors: int = 0
    processed_brand_count: int = 0
    processed_model_count: int = 0

    def as_dict(self) -> dict[str, int | str | bool]:
        return asdict(self)


class VehicleCatalogProvider:
    provider_name: str

    def fetch_catalog(self) -> list[VehicleCatalogBrandRecord]:
        raise NotImplementedError


class LocalBundleVehicleCatalogProvider(VehicleCatalogProvider):
    provider_name = "local_bundle"

    def __init__(self, bundle_path: str | None = None) -> None:
        settings = get_settings()
        raw_path = bundle_path or settings.vehicle_catalog_bundle_path
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = get_bundle_root() / candidate
        self.bundle_path = candidate.resolve()

    def fetch_catalog(self) -> list[VehicleCatalogBrandRecord]:
        if not self.bundle_path.exists():
            raise AppError(
                code="vehicle_catalog_bundle_not_found",
                message=f"Файл каталога не найден: {self.bundle_path}",
                status_code=500,
            )

        payload = json.loads(self.bundle_path.read_text(encoding="utf-8"))
        records: list[VehicleCatalogBrandRecord] = []

        for brand in payload.get("brands", []):
            brand_slug = str(brand.get("slug") or "").strip()
            brand_name = str(brand.get("display_name") or brand.get("name_en") or brand.get("name_ru") or "").strip()
            if not brand_slug or not brand_name:
                continue

            models: list[VehicleCatalogModelRecord] = []
            for model in brand.get("models", []):
                model_slug = str(model.get("slug") or "").strip()
                model_name = str(model.get("display_name") or model.get("name_en") or model.get("name_ru") or "").strip()
                if not model_slug or not model_name:
                    continue

                models.append(
                    VehicleCatalogModelRecord(
                        source_model_id=f"{brand_slug}:{model_slug}",
                        name=model_name,
                    )
                )

            records.append(
                VehicleCatalogBrandRecord(
                    source_brand_id=brand_slug,
                    name=brand_name,
                    models=models,
                )
            )

        return records


class VehicleCatalogSyncService:
    LAST_SYNC_AT_KEY = "vehicle_catalog_last_synced_at"
    LAST_SYNC_PROVIDER_KEY = "vehicle_catalog_last_sync_provider"
    MODE_MERGE = "merge"
    MODE_REPLACE = "replace"

    def __init__(self, session: Session, provider: VehicleCatalogProvider | None = None) -> None:
        self.session = session
        self.settings = get_settings()
        self.provider = provider or self._build_provider()
        self.brand_repository = CarBrandRepository(session)
        self.model_repository = CarModelRepository(session)
        self.setting_repository = SettingRepository(session)

    def _build_provider(self) -> VehicleCatalogProvider:
        provider_name = self.settings.vehicle_catalog_provider.strip().lower()
        if provider_name == "local_bundle":
            return LocalBundleVehicleCatalogProvider()
        raise AppError(
            code="invalid_vehicle_catalog_provider",
            message=f"Поддерживается только локальный каталог car_catalog_files, получено: {provider_name}",
            status_code=500,
        )

    def sync_if_due(
        self,
        *,
        now: datetime | None = None,
        replace: bool = False,
        dry_run: bool = False,
    ) -> VehicleCatalogSyncResult | None:
        current_time = now or datetime.now(UTC)
        if not self._is_sync_due(current_time):
            logger.info("Vehicle catalog sync skipped because the configured interval has not elapsed yet")
            return None
        return self.sync(now=current_time, replace=replace, dry_run=dry_run)

    def sync(
        self,
        *,
        now: datetime | None = None,
        replace: bool = False,
        dry_run: bool = False,
    ) -> VehicleCatalogSyncResult:
        started_at = now or datetime.now(UTC)
        mode = self.MODE_REPLACE if replace else self.MODE_MERGE
        logger.info("Starting vehicle catalog sync via %s in %s mode (dry_run=%s)", self.provider.provider_name, mode, dry_run)

        catalog = self._validate_catalog(self.provider.fetch_catalog())
        result = VehicleCatalogSyncResult(
            provider=self.provider.provider_name,
            mode=mode,
            dry_run=dry_run,
            started_at=started_at.isoformat(),
            completed_at=started_at.isoformat(),
            processed_brand_count=len(catalog),
            processed_model_count=sum(len(brand.models) for brand in catalog),
        )

        if replace:
            self._sync_replace(catalog, result)
        else:
            self._sync_merge(catalog, result)

        completed_at = now or datetime.now(UTC)
        result.completed_at = completed_at.isoformat()
        if dry_run:
            self.session.rollback()
            logger.info("Vehicle catalog sync dry-run complete: %s", result.as_dict())
            return result

        self._set_setting(self.LAST_SYNC_AT_KEY, completed_at.isoformat())
        self._set_setting(self.LAST_SYNC_PROVIDER_KEY, self.provider.provider_name)
        self.session.commit()
        logger.info("Vehicle catalog sync complete: %s", result.as_dict())
        return result

    def _validate_catalog(self, catalog: list[VehicleCatalogBrandRecord]) -> list[VehicleCatalogBrandRecord]:
        brand_ids: set[str] = set()
        brand_names: set[str] = set()

        for brand in catalog:
            normalized_brand_name = normalize_reference_lookup_key(brand.name, entity="brand")
            if not brand.source_brand_id or not normalized_brand_name:
                raise AppError(code="vehicle_catalog_invalid_bundle", message="Каталог содержит бренд без идентификатора или имени", status_code=422)
            if brand.source_brand_id in brand_ids:
                raise AppError(code="vehicle_catalog_invalid_bundle", message=f"Дубликат source_brand_id: {brand.source_brand_id}", status_code=422)
            if normalized_brand_name in brand_names:
                raise AppError(code="vehicle_catalog_invalid_bundle", message=f"Дубликат названия бренда: {brand.name}", status_code=422)
            brand_ids.add(brand.source_brand_id)
            brand_names.add(normalized_brand_name)

            model_ids: set[str] = set()
            model_names: set[str] = set()
            for model in brand.models:
                normalized_model_name = normalize_reference_lookup_key(model.name, entity="model")
                if not model.source_model_id or not normalized_model_name:
                    raise AppError(code="vehicle_catalog_invalid_bundle", message=f"Бренд {brand.name} содержит модель без идентификатора или имени", status_code=422)
                if model.source_model_id in model_ids:
                    raise AppError(code="vehicle_catalog_invalid_bundle", message=f"Дубликат source_model_id: {model.source_model_id}", status_code=422)
                if normalized_model_name in model_names:
                    raise AppError(code="vehicle_catalog_invalid_bundle", message=f"Дубликат модели {model.name} у бренда {brand.name}", status_code=422)
                model_ids.add(model.source_model_id)
                model_names.add(normalized_model_name)

        return catalog

    def _sync_merge(self, catalog: list[VehicleCatalogBrandRecord], result: VehicleCatalogSyncResult) -> None:
        for brand_index, brand_record in enumerate(catalog, start=1):
            brand_name = canonicalize_reference_name(brand_record.name)
            normalized_brand_name = normalize_reference_lookup_key(brand_record.name, entity="brand")
            brand = self.brand_repository.get_by_source_identifier(self.provider.provider_name, brand_record.source_brand_id)
            if brand is None:
                brand = self.brand_repository.get_by_normalized_name(normalized_brand_name)

            if brand is None:
                brand = CrmCarBrand(
                    name=brand_name,
                    normalized_name=normalized_brand_name,
                    source_name=self.provider.provider_name,
                    source_brand_id=brand_record.source_brand_id,
                    sort_order=brand_index,
                    is_active=True,
                )
                self.brand_repository.create(brand)
                result.brands_added += 1
            else:
                changed = False
                if brand.name != brand_name:
                    brand.name = brand_name
                    changed = True
                if brand.normalized_name != normalized_brand_name:
                    brand.normalized_name = normalized_brand_name
                    changed = True
                if brand.source_name != self.provider.provider_name:
                    brand.source_name = self.provider.provider_name
                    changed = True
                if brand.source_brand_id != brand_record.source_brand_id:
                    brand.source_brand_id = brand_record.source_brand_id
                    changed = True
                if brand.sort_order != brand_index:
                    brand.sort_order = brand_index
                    changed = True
                if not brand.is_active:
                    brand.is_active = True
                    changed = True
                if changed:
                    result.brands_updated += 1
                else:
                    result.brands_skipped += 1

            for model_index, model_record in enumerate(brand_record.models, start=1):
                model_name = canonicalize_reference_name(model_record.name)
                normalized_model_name = normalize_reference_lookup_key(model_record.name, entity="model")
                model = self.model_repository.get_by_source_identifier(self.provider.provider_name, model_record.source_model_id)
                if model is None:
                    model = self.model_repository.get_by_brand_and_normalized_name(brand.id, normalized_model_name)

                if model is None:
                    model = CrmCarModel(
                        brand_id=brand.id,
                        name=model_name,
                        normalized_name=normalized_model_name,
                        source_name=self.provider.provider_name,
                        source_model_id=model_record.source_model_id,
                        sort_order=model_index,
                        is_active=True,
                    )
                    self.model_repository.create(model)
                    result.models_added += 1
                else:
                    changed = False
                    if model.brand_id != brand.id:
                        model.brand_id = brand.id
                        changed = True
                    if model.name != model_name:
                        model.name = model_name
                        changed = True
                    if model.normalized_name != normalized_model_name:
                        model.normalized_name = normalized_model_name
                        changed = True
                    if model.source_name != self.provider.provider_name:
                        model.source_name = self.provider.provider_name
                        changed = True
                    if model.source_model_id != model_record.source_model_id:
                        model.source_model_id = model_record.source_model_id
                        changed = True
                    if model.sort_order != model_index:
                        model.sort_order = model_index
                        changed = True
                    if not model.is_active:
                        model.is_active = True
                        changed = True
                    if changed:
                        result.models_updated += 1
                    else:
                        result.models_skipped += 1

        self.session.flush()

    def _sync_replace(self, catalog: list[VehicleCatalogBrandRecord], result: VehicleCatalogSyncResult) -> None:
        result.vehicles_detached = self._detach_existing_vehicle_references()

        existing_model_count = len(self.session.scalars(select(CrmCarModel.id)).all())
        existing_brand_count = len(self.session.scalars(select(CrmCarBrand.id)).all())
        self.session.execute(delete(CrmCarModel))
        self.session.execute(delete(CrmCarBrand))
        self.session.flush()
        result.models_deleted = existing_model_count
        result.brands_deleted = existing_brand_count

        for brand_index, brand_record in enumerate(catalog, start=1):
            brand = CrmCarBrand(
                name=canonicalize_reference_name(brand_record.name),
                normalized_name=normalize_reference_lookup_key(brand_record.name, entity="brand"),
                source_name=self.provider.provider_name,
                source_brand_id=brand_record.source_brand_id,
                sort_order=brand_index,
                is_active=True,
            )
            self.brand_repository.create(brand)
            result.brands_added += 1

            for model_index, model_record in enumerate(brand_record.models, start=1):
                model_name = canonicalize_reference_name(model_record.name)
                model = CrmCarModel(
                    brand_id=brand.id,
                    name=model_name,
                    normalized_name=normalize_reference_lookup_key(model_name, entity="model"),
                    source_name=self.provider.provider_name,
                    source_model_id=model_record.source_model_id,
                    sort_order=model_index,
                    is_active=True,
                )
                self.model_repository.create(model)
                result.models_added += 1

    def _detach_existing_vehicle_references(self) -> int:
        detached = 0
        vehicles = self.session.scalars(
            select(CrmVehicle).options(selectinload(CrmVehicle.brand_ref), selectinload(CrmVehicle.model_ref))
        ).all()
        for vehicle in vehicles:
            changed = False
            if vehicle.brand is None and vehicle.brand_ref is not None:
                vehicle.brand = vehicle.brand_ref.name
                changed = True
            if vehicle.model is None and vehicle.model_ref is not None:
                vehicle.model = vehicle.model_ref.name
                changed = True
            if vehicle.brand_id is not None:
                vehicle.brand_id = None
                changed = True
            if vehicle.model_id is not None:
                vehicle.model_id = None
                changed = True
            if changed:
                detached += 1
        return detached

    def _is_sync_due(self, current_time: datetime) -> bool:
        last_sync_at = self._get_last_sync_at()
        if last_sync_at is None:
            return True
        interval = timedelta(days=max(1, self.settings.vehicle_catalog_sync_interval_days))
        return current_time - last_sync_at >= interval

    def _get_last_sync_at(self) -> datetime | None:
        setting = self.setting_repository.get_by_key(self.LAST_SYNC_AT_KEY)
        if setting is None or not setting.value.strip():
            return None
        return datetime.fromisoformat(setting.value)

    def _set_setting(self, key: str, value: str) -> None:
        setting = self.setting_repository.get_by_key(key)
        if setting is None:
            self.setting_repository.create(CrmSetting(key=key, value=value))
            return
        setting.value = value


def maybe_run_monthly_vehicle_catalog_sync() -> VehicleCatalogSyncResult | None:
    settings = get_settings()
    if not settings.vehicle_catalog_monthly_sync_enabled:
        return None

    from app.db.session import SessionLocal

    session = SessionLocal()
    try:
        return VehicleCatalogSyncService(session).sync_if_due()
    finally:
        session.close()
