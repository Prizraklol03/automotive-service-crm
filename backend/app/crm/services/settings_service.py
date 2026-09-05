from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.core.config import get_document_templates_dir, get_generated_documents_dir, get_settings
from app.crm.models.setting import CrmSetting
from app.crm.models.user_preference import CrmUserPreference
from app.crm.repositories.car_brand_repository import CarBrandRepository
from app.crm.repositories.car_model_repository import CarModelRepository
from app.crm.repositories.setting_repository import SettingRepository
from app.crm.schemas.settings import DEFAULT_ORDER_SORTING, ModulesConfig, UserPreferencesRead, UserPreferencesUpdate, VisualConfig
from app.crm.services.vehicle_catalog_sync_service import VehicleCatalogSyncService


class SettingsService:
    VEHICLE_CATALOG_LAST_SYNC_AT_KEY = VehicleCatalogSyncService.LAST_SYNC_AT_KEY
    VEHICLE_CATALOG_LAST_SYNC_PROVIDER_KEY = VehicleCatalogSyncService.LAST_SYNC_PROVIDER_KEY
    MODULES_CONFIG_KEY = "modules_config"
    VISUAL_CONFIG_KEY = "visual_config"

    def __init__(self, session: Session) -> None:
        self.session = session
        self.runtime_settings = get_settings()
        self.repository = SettingRepository(session)
        self.brands = CarBrandRepository(session)
        self.models = CarModelRepository(session)

    def get_settings_payload(self) -> dict[str, str | int]:
        return {
            "templates_storage_path": str(get_document_templates_dir()),
            "generated_storage_path": str(get_generated_documents_dir()),
        }

    def ensure_defaults(self) -> None:
        defaults = {
            self.MODULES_CONFIG_KEY: ModulesConfig().model_dump_json(),
            self.VISUAL_CONFIG_KEY: VisualConfig().model_dump_json(),
        }
        for key, value in defaults.items():
            if self.repository.get_by_key(key) is None:
                self.repository.create(CrmSetting(key=key, value=value))
        self.session.commit()

    def get_vehicle_catalog_status_payload(self) -> dict[str, str | int | bool | None]:
        return {
            "provider": self.runtime_settings.vehicle_catalog_provider,
            "last_synced_at": self._get_setting_value(self.VEHICLE_CATALOG_LAST_SYNC_AT_KEY),
            "brand_count": self.brands.count_all(),
            "model_count": self.models.count_all(),
            "monthly_sync_enabled": self.runtime_settings.vehicle_catalog_monthly_sync_enabled,
            "sync_interval_days": self.runtime_settings.vehicle_catalog_sync_interval_days,
        }

    def run_vehicle_catalog_sync(self, *, replace: bool = False, dry_run: bool = False) -> dict[str, str | int | bool | None]:
        result = VehicleCatalogSyncService(self.session).sync(replace=replace, dry_run=dry_run)
        payload = self.get_vehicle_catalog_status_payload()
        payload.update(result.as_dict())
        return payload

    def get_modules(self) -> ModulesConfig:
        setting = self.repository.get_by_key(self.MODULES_CONFIG_KEY)
        if setting is None:
            return ModulesConfig()
        try:
            return ModulesConfig.model_validate(json.loads(setting.value))
        except (ValueError, json.JSONDecodeError):
            return ModulesConfig()

    def update_modules(self, payload: ModulesConfig) -> ModulesConfig:
        setting = self.repository.get_by_key(self.MODULES_CONFIG_KEY)
        value = payload.model_dump_json()
        if setting is None:
            self.repository.create(CrmSetting(key=self.MODULES_CONFIG_KEY, value=value))
        else:
            setting.value = value
        self.session.commit()
        return payload

    def get_visual_config(self) -> VisualConfig:
        setting = self.repository.get_by_key(self.VISUAL_CONFIG_KEY)
        if setting is None:
            return VisualConfig()
        try:
            return VisualConfig.model_validate(json.loads(setting.value))
        except (ValueError, json.JSONDecodeError):
            return VisualConfig()

    def update_visual_config(self, payload: VisualConfig) -> VisualConfig:
        setting = self.repository.get_by_key(self.VISUAL_CONFIG_KEY)
        value = payload.model_dump_json()
        if setting is None:
            self.repository.create(CrmSetting(key=self.VISUAL_CONFIG_KEY, value=value))
        else:
            setting.value = value
        self.session.commit()
        return payload

    def get_user_preferences(self, user_id: int) -> UserPreferencesRead:
        row = self.session.get(CrmUserPreference, user_id)
        if row is None:
            row = CrmUserPreference(user_id=user_id, order_sorting=json.dumps(DEFAULT_ORDER_SORTING))
            self.session.add(row)
            self.session.commit()

        return UserPreferencesRead(order_sorting=self._load_order_sorting(row.order_sorting))

    def update_user_preferences(self, user_id: int, payload: UserPreferencesUpdate) -> UserPreferencesRead:
        row = self.session.get(CrmUserPreference, user_id)
        encoded_sorting = json.dumps([item.model_dump() for item in payload.order_sorting])
        if row is None:
            row = CrmUserPreference(user_id=user_id, order_sorting=encoded_sorting)
            self.session.add(row)
        else:
            row.order_sorting = encoded_sorting
        self.session.commit()
        return UserPreferencesRead(order_sorting=payload.order_sorting)

    def _get_setting_value(self, key: str) -> str | None:
        setting = self.repository.get_by_key(key)
        return setting.value if setting else None

    def _load_order_sorting(self, value: str) -> list:
        try:
            payload = json.loads(value)
            return UserPreferencesUpdate(order_sorting=payload).order_sorting
        except (TypeError, ValueError, json.JSONDecodeError):
            return UserPreferencesUpdate(order_sorting=DEFAULT_ORDER_SORTING).order_sorting
