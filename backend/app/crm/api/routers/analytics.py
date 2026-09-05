from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.analytics import AnalyticsDashboardRead, AnalyticsDrilldownRead
from app.crm.services.analytics_v3_service import AnalyticsV3Service

router = APIRouter()


@router.get("/dashboard", response_model=AnalyticsDashboardRead)
def get_analytics_dashboard(
    date_from: date | None = None,
    date_to: date | None = None,
    period_preset: str = "working_month",
    category_ids: list[int] | None = Query(default=None),
    order_statuses: list[str] | None = Query(default=None),
    finance_category_ids: list[int] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("analytics.view")),
) -> AnalyticsDashboardRead:
    return AnalyticsV3Service(db).get_dashboard(
        date_from=date_from,
        date_to=date_to,
        period_preset=period_preset,
        category_ids=category_ids,
        order_statuses=order_statuses,
        finance_category_ids=finance_category_ids,
    )


@router.get("/drilldown", response_model=AnalyticsDrilldownRead)
def get_analytics_drilldown(
    metric: str,
    date_from: date | None = None,
    date_to: date | None = None,
    period_preset: str = "working_month",
    category_ids: list[int] | None = Query(default=None),
    order_statuses: list[str] | None = Query(default=None),
    finance_category_ids: list[int] | None = Query(default=None),
    category_id: int | None = None,
    service_name: str | None = None,
    client_id: int | None = None,
    point_from: date | None = None,
    point_to: date | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("analytics.view")),
) -> AnalyticsDrilldownRead:
    return AnalyticsV3Service(db).get_drilldown(
        metric=metric,
        date_from=date_from,
        date_to=date_to,
        period_preset=period_preset,
        category_ids=category_ids,
        order_statuses=order_statuses,
        finance_category_ids=finance_category_ids,
        category_id=category_id,
        service_name=service_name,
        client_id=client_id,
        point_from=point_from,
        point_to=point_to,
    )
