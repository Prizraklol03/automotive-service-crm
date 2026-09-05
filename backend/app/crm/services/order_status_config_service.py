from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.order_status import ARCHIVED_GROUPS, CrmOrderStatus, StatusGroup
from app.crm.schemas.order_status import (
    OrderStatusCreatePayload,
    OrderStatusRead,
    OrderStatusUpdatePayload,
)
from app.crm.schemas.settings import VisualConfig
from app.crm.services.settings_service import SettingsService

VALID_GROUPS = {g.value for g in StatusGroup}


def hex_to_hsl_hue(hex_color: str) -> int:
    """Convert hex color (#RRGGBB) to HSL hue (0-360). Handles both 6 and 8 digit hex."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 8:  # RRGGBBAA
        hex_color = hex_color[:6]
    if len(hex_color) != 6:
        return 0  # fallback

    r, g, b = int(hex_color[0:2], 16) / 255.0, int(hex_color[2:4], 16) / 255.0, int(hex_color[4:6], 16) / 255.0

    max_c = max(r, g, b)
    min_c = min(r, g, b)
    l = (max_c + min_c) / 2.0

    if max_c == min_c:
        h = 0.0
    else:
        d = max_c - min_c
        if max_c == r:
            h = (60.0 * (((g - b) / d) % 6.0)) % 360.0
        elif max_c == g:
            h = (60.0 * ((b - r) / d + 2.0)) % 360.0
        else:
            h = (60.0 * ((r - g) / d + 4.0)) % 360.0

    return round(h) % 360


def _slugify(text: str) -> str:
    """Генерирует slug из текста (для auto-code). Допускает latin + цифры + _."""
    slug = re.sub(r"[^\w]", "_", text.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "status"


class OrderStatusConfigService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _validate_group(self, group: str) -> None:
        if group not in VALID_GROUPS:
            raise AppError(
                code="validation_error",
                message=f"Недопустимая группа статуса: {group!r}. Допустимые: {', '.join(sorted(VALID_GROUPS))}",
                status_code=422,
            )

    def _validate_list(self, statuses: list[CrmOrderStatus]) -> None:
        groups = {s.status_group for s in statuses}
        if StatusGroup.CLOSED.value not in groups:
            raise AppError(
                code="validation_error",
                message="Нужен хотя бы один статус группы «Выдан» (closed)",
                status_code=422,
            )
        if StatusGroup.CANCELLED.value not in groups:
            raise AppError(
                code="validation_error",
                message="Нужен хотя бы один статус группы «Отменён» (cancelled)",
                status_code=422,
            )
        defaults = [s for s in statuses if s.is_default]
        if len(defaults) != 1:
            raise AppError(
                code="validation_error",
                message="Ровно один статус должен быть статусом по умолчанию",
                status_code=422,
            )

    def _generate_unique_code(self, display_name: str) -> str:
        base = _slugify(display_name)[:40]
        suffix = uuid.uuid4().hex[:6]
        code = f"{base}_{suffix}"
        # Ensure uniqueness
        while self.session.get(CrmOrderStatus, code) is not None:
            suffix = uuid.uuid4().hex[:6]
            code = f"{base}_{suffix}"
        return code

    # ── Read ──────────────────────────────────────────────────────────────────

    def list_all(self) -> list[CrmOrderStatus]:
        return list(
            self.session.scalars(
                select(CrmOrderStatus).order_by(CrmOrderStatus.sort_order, CrmOrderStatus.code)
            )
        )

    def get(self, code: str) -> CrmOrderStatus:
        record = self.session.get(CrmOrderStatus, code)
        if not record:
            raise AppError(code="not_found", message="Статус не найден", status_code=404)
        return record

    # ── Write ─────────────────────────────────────────────────────────────────

    def create(self, payload: OrderStatusCreatePayload) -> CrmOrderStatus:
        self._validate_group(payload.status_group)

        code = self._generate_unique_code(payload.display_name)

        # Если новый статус is_default — сбрасываем флаг у остальных
        if payload.is_default:
            self._clear_defaults()

        record = CrmOrderStatus(
            code=code,
            display_name=payload.display_name.strip(),
            status_group=payload.status_group,
            color=payload.color,
            sort_order=payload.sort_order,
            is_default=payload.is_default,
        )
        self.session.add(record)
        self.session.flush()

        # Проверяем целостность всего списка
        self._validate_list(self.list_all())
        self.session.commit()

        # Update visual_config with new status colors
        self._sync_visual_config()
        return record

    def update(self, code: str, payload: OrderStatusUpdatePayload) -> CrmOrderStatus:
        self._validate_group(payload.status_group)
        record = self.get(code)

        if payload.is_default and not record.is_default:
            self._clear_defaults()

        record.display_name = payload.display_name.strip()
        record.status_group = payload.status_group
        record.color = payload.color
        record.is_default = payload.is_default
        record.sort_order = payload.sort_order

        self.session.flush()
        self._validate_list(self.list_all())
        self.session.commit()

        # Update visual_config with new status colors
        self._sync_visual_config()
        return record

    def delete(self, code: str) -> None:
        record = self.get(code)

        # Нельзя удалить статус, к которому привязаны заказы
        from app.crm.models.order import CrmOrder
        from sqlalchemy import func

        count = self.session.scalar(
            select(func.count()).where(CrmOrder.status == code)
        )
        if count and count > 0:
            raise AppError(
                code="conflict",
                message=f"Нельзя удалить статус «{record.display_name}»: к нему привязано {count} заказ(ов)",
                status_code=409,
            )

        self.session.delete(record)
        self.session.flush()

        # Validate remaining list
        remaining = self.list_all()
        self._validate_list(remaining)
        self.session.commit()

        # Update visual_config with new status colors
        self._sync_visual_config()

    def reorder(self, codes: list[str]) -> list[CrmOrderStatus]:
        """Переставляет статусы в указанном порядке (sort_order = индекс)."""
        all_statuses = {s.code: s for s in self.list_all()}
        expected_codes = set(all_statuses)
        incoming_codes = list(codes)

        if set(incoming_codes) != expected_codes or len(incoming_codes) != len(expected_codes):
            raise AppError(
                code="validation_error",
                message="Нужно передать полный список кодов статусов без пропусков и дубликатов",
                status_code=422,
            )

        for idx, code in enumerate(codes):
            all_statuses[code].sort_order = idx

        self.session.flush()
        self.session.commit()

        # Sync visual_config (though sort_order doesn't affect it, good for consistency)
        self._sync_visual_config()
        return self.list_all()

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _clear_defaults(self) -> None:
        for s in self.list_all():
            s.is_default = False

    def _sync_visual_config(self) -> None:
        """Update visual_config.status_colors with current status hex colors converted to hues."""
        settings_service = SettingsService(self.session)
        visual_config = settings_service.get_visual_config()

        # Build status_colors dict from current statuses
        status_colors: dict[str, int | None] = {}
        for status in self.list_all():
            if status.color:
                status_colors[status.code] = hex_to_hsl_hue(status.color)
            else:
                status_colors[status.code] = None

        visual_config.status_colors = status_colors
        settings_service.update_visual_config(visual_config)

    # ── Status group map (for business logic) ─────────────────────────────────

    def build_group_map(self) -> dict[str, str]:
        """Возвращает {code: status_group} для всех статусов."""
        return {s.code: s.status_group for s in self.list_all()}

    def get_default_code(self) -> str:
        """Код дефолтного статуса (fallback: 'new')."""
        for s in self.list_all():
            if s.is_default:
                return s.code
        return "new"

    @staticmethod
    def to_read(record: CrmOrderStatus) -> OrderStatusRead:
        return OrderStatusRead.model_validate(record)
