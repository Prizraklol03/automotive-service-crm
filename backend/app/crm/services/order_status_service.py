from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from app.core.time import app_now_naive, to_app_naive
from app.crm.models.order import CrmOrder
from app.crm.models.order_status import ARCHIVED_GROUPS, StatusGroup

if TYPE_CHECKING:
    from app.crm.models.order_status import CrmOrderStatus


class OrderStatusService:

    @staticmethod
    def _utc_now_naive() -> datetime:
        return app_now_naive()

    @classmethod
    def apply_status(
        cls,
        order: CrmOrder,
        next_status: "CrmOrderStatus",
        *,
        completed_at: datetime | None = None,
    ) -> CrmOrder:
        order.status = next_status.code

        group = next_status.group

        if group == StatusGroup.CLOSED:
            # Фиксируем время выдачи
            order.completed_at = (
                to_app_naive(completed_at)
                if completed_at
                else order.completed_at or cls._utc_now_naive()
            )
        else:
            # Уходим из CLOSED — сбрасываем дату выдачи
            order.completed_at = None

        order.is_archived = group in ARCHIVED_GROUPS
        return order
