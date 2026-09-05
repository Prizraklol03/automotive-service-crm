from typing import Literal

from pydantic import Field
from pydantic import model_validator

from app.crm.schemas.common import CrmSchema


OrderSortKey = str
OrderSortDirection = str


DEFAULT_ORDER_SORTING = [
    {"key": "status", "direction": "asc"},
    {"key": "scheduled_for", "direction": "asc"},
    {"key": "id", "direction": "desc"},
]

ORDER_SORT_KEYS = {
    "status",
    "scheduled_for",
    "id",
    "updated_at",
    "amount_to_pay",
    "client_full_name",
    "vehicle_plate_number",
    "vehicle_brand",
    "vehicle_model",
}
ORDER_SORT_DIRECTIONS = {"asc", "desc"}


class OrderSortPreference(CrmSchema):
    key: OrderSortKey
    direction: OrderSortDirection

    @model_validator(mode="after")
    def validate_sort_item(self) -> "OrderSortPreference":
        if self.key not in ORDER_SORT_KEYS:
            raise ValueError("Unsupported order sort key")
        if self.direction not in ORDER_SORT_DIRECTIONS:
            raise ValueError("Unsupported order sort direction")
        return self


class UserPreferencesRead(CrmSchema):
    order_sorting: list[OrderSortPreference]


class UserPreferencesUpdate(CrmSchema):
    order_sorting: list[OrderSortPreference] = Field(min_length=1, max_length=len(ORDER_SORT_KEYS))

    @model_validator(mode="after")
    def validate_sorting(self) -> "UserPreferencesUpdate":
        keys = [item.key for item in self.order_sorting]
        if len(keys) != len(set(keys)):
            raise ValueError("Order sort keys must be unique")
        return self


class SettingsRead(CrmSchema):
    templates_storage_path: str
    generated_storage_path: str


class VehicleCatalogStatusRead(CrmSchema):
    provider: str
    last_synced_at: str | None = None
    brand_count: int = Field(ge=0)
    model_count: int = Field(ge=0)
    monthly_sync_enabled: bool
    sync_interval_days: int = Field(ge=1)


class ModulesConfig(CrmSchema):
    photos: bool = False
    customer_payer: bool = False
    scheduler: bool = False
    warehouse: bool = False
    vin_catalog: bool = False
    labor_norms: bool = False
    salary: bool = False
    maintenance_schedule: bool = False
    kanban: bool = False
    online_booking: bool = False
    client_portal: bool = False


class VehicleCatalogSyncRead(VehicleCatalogStatusRead):
    mode: str
    dry_run: bool
    started_at: str
    completed_at: str
    brands_added: int = Field(ge=0)
    brands_updated: int = Field(ge=0)
    brands_skipped: int = Field(ge=0)
    brands_deleted: int = Field(ge=0)
    models_added: int = Field(ge=0)
    models_updated: int = Field(ge=0)
    models_skipped: int = Field(ge=0)
    models_deleted: int = Field(ge=0)
    vehicles_detached: int = Field(ge=0)
    fetch_errors: int = Field(ge=0)
    processed_brand_count: int = Field(ge=0)
    processed_model_count: int = Field(ge=0)


class VisualConfig(CrmSchema):
    accent_hue: int | None = Field(default=None, ge=0, le=360)
    # status_colors: {status_code: hue_int | None} — dynamic, supports any status code
    status_colors: dict[str, int | None] | None = None
    ui_density: Literal["comfortable", "compact"] | None = None
    preset: str | None = None
    working_month_start_day: int = Field(default=25, ge=1, le=28)
