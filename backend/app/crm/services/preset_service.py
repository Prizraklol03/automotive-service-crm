from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.order import CrmOrder
from app.crm.models.order_status import CrmOrderStatus, StatusGroup
from app.crm.schemas.order_status import OrderStatusRead
from app.crm.schemas.preset import PresetRead, PresetStatusDef, PresetApplyResult
from app.crm.services.order_status_config_service import OrderStatusConfigService

# ── Preset definitions ────────────────────────────────────────────────────────

PRESETS: dict[str, dict] = {
    "detailing": {
        "label": "Детейлинг",
        "description": "Для детейлинг-студий: приёмка, мойка, полировка, бронирование, выдача",
        "statuses": [
            {"display_name": "Принято", "status_group": "new", "color": "#6366f1", "is_default": True, "sort_order": 0},
            {"display_name": "В работе", "status_group": "in_progress", "color": "#3b82f6", "is_default": False, "sort_order": 1},
            {"display_name": "Отложен", "status_group": "in_progress", "color": "#f97316", "is_default": False, "sort_order": 2},
            {"display_name": "Ожидание материалов", "status_group": "in_progress", "color": "#f59e0b", "is_default": False, "sort_order": 3},
            {"display_name": "Готово к выдаче", "status_group": "done", "color": "#10b981", "is_default": False, "sort_order": 4},
            {"display_name": "Выдан", "status_group": "closed", "color": "#6b7280", "is_default": False, "sort_order": 5},
            {"display_name": "Отменён", "status_group": "cancelled", "color": "#ef4444", "is_default": False, "sort_order": 6},
        ],
    },
    "autoservice": {
        "label": "Автосервис",
        "description": "Полный цикл: диагностика, согласование, ремонт, ожидание запчастей, выдача",
        "statuses": [
            {"display_name": "Новый заказ", "status_group": "new", "color": "#6366f1", "is_default": True, "sort_order": 0},
            {"display_name": "Диагностика", "status_group": "in_progress", "color": "#3b82f6", "is_default": False, "sort_order": 1},
            {"display_name": "Согласование", "status_group": "in_progress", "color": "#f59e0b", "is_default": False, "sort_order": 2},
            {"display_name": "В работе", "status_group": "in_progress", "color": "#06b6d4", "is_default": False, "sort_order": 3},
            {"display_name": "Ожидание запчастей", "status_group": "in_progress", "color": "#f97316", "is_default": False, "sort_order": 4},
            {"display_name": "Готово", "status_group": "done", "color": "#10b981", "is_default": False, "sort_order": 5},
            {"display_name": "Выдан", "status_group": "closed", "color": "#6b7280", "is_default": False, "sort_order": 6},
            {"display_name": "Отменён", "status_group": "cancelled", "color": "#ef4444", "is_default": False, "sort_order": 7},
        ],
    },
    "minimal": {
        "label": "Чистый лист",
        "description": "Минимальный набор из 4 статусов для простого учёта",
        "statuses": [
            {"display_name": "Новый", "status_group": "new", "color": "#6366f1", "is_default": True, "sort_order": 0},
            {"display_name": "В работе", "status_group": "in_progress", "color": "#3b82f6", "is_default": False, "sort_order": 1},
            {"display_name": "Выполнен", "status_group": "closed", "color": "#10b981", "is_default": False, "sort_order": 2},
            {"display_name": "Отменён", "status_group": "cancelled", "color": "#ef4444", "is_default": False, "sort_order": 3},
        ],
    },
}


class PresetService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self._config = OrderStatusConfigService(session)

    def list_presets(self) -> list[PresetRead]:
        result = []
        for name, data in PRESETS.items():
            result.append(
                PresetRead(
                    name=name,
                    label=data["label"],
                    description=data["description"],
                    statuses=[PresetStatusDef(**s) for s in data["statuses"]],
                )
            )
        return result

    def get_preset(self, name: str) -> PresetRead:
        if name not in PRESETS:
            raise AppError(code="not_found", message=f"Пресет «{name}» не найден", status_code=404)
        data = PRESETS[name]
        return PresetRead(
            name=name,
            label=data["label"],
            description=data["description"],
            statuses=[PresetStatusDef(**s) for s in data["statuses"]],
        )

    def apply_preset(self, name: str) -> PresetApplyResult:
        """
        Applies a preset:
        1. Create all new statuses from the preset (with auto-generated codes).
        2. Build a mapping from old status group → first new status in that group.
        3. Bulk-update all orders: old status code → new code (same group).
        4. Delete all old statuses.
        5. Return new status list.
        """
        preset_data = PRESETS.get(name)
        if not preset_data:
            raise AppError(code="not_found", message=f"Пресет «{name}» не найден", status_code=404)

        old_statuses = self._config.list_all()

        # ── Step 1: create new preset statuses ────────────────────────────────
        new_statuses: list[CrmOrderStatus] = []
        for s_def in preset_data["statuses"]:
            code = self._config._generate_unique_code(s_def["display_name"])
            record = CrmOrderStatus(
                code=code,
                display_name=s_def["display_name"],
                status_group=s_def["status_group"],
                color=s_def["color"],
                sort_order=s_def["sort_order"],
                is_default=s_def["is_default"],
            )
            self.session.add(record)
            new_statuses.append(record)

        self.session.flush()  # assign codes

        # ── Step 2: build group → first new status mapping ─────────────────
        group_to_new: dict[str, str] = {}
        default_code: str = new_statuses[0].code
        for s in new_statuses:
            if s.is_default:
                default_code = s.code
            if s.status_group not in group_to_new:
                group_to_new[s.status_group] = s.code

        # ── Step 3: migrate orders from old statuses ───────────────────────
        for old in old_statuses:
            replacement_code = group_to_new.get(old.status_group, default_code)
            self.session.execute(
                update(CrmOrder)
                .where(CrmOrder.status == old.code)
                .values(status=replacement_code)
            )

        self.session.flush()

        # ── Step 4: delete old statuses (no orders reference them now) ─────
        for old in old_statuses:
            self.session.delete(old)

        self.session.flush()
        self.session.commit()

        # ── Step 5: return new list ────────────────────────────────────────
        final = self._config.list_all()
        return PresetApplyResult(
            preset_name=name,
            statuses=[OrderStatusConfigService.to_read(s) for s in final],
        )
