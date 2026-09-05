from __future__ import annotations

from app.crm.schemas.common import CrmSchema
from app.crm.schemas.order_status import OrderStatusRead


class PresetStatusDef(CrmSchema):
    display_name: str
    status_group: str
    color: str
    is_default: bool
    sort_order: int


class PresetRead(CrmSchema):
    name: str
    label: str
    description: str
    statuses: list[PresetStatusDef]


class PresetApplyResult(CrmSchema):
    preset_name: str
    statuses: list[OrderStatusRead]
