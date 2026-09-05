from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.client_ip import resolve_client_ip
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.core.security import InMemoryRateLimiter
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.external_lead import (
    ExternalLeadDetailRead,
    ExternalLeadErrorResponse,
    ExternalLeadListItemRead,
    ExternalLeadStatusUpdate,
    ExternalLeadSubmitResponse,
    ExternalLeadSummaryRead,
)
from app.crm.services.external_lead_service import ExternalLeadService

router = APIRouter()
logger = get_logger(__name__)
_external_lead_rate_limiter = InMemoryRateLimiter()


def reset_external_lead_rate_limiter() -> None:
    _external_lead_rate_limiter.clear()


def _error_response(
    *,
    status_code: int,
    error: str,
    message: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    payload = ExternalLeadErrorResponse(success=False, error=error, message=message).model_dump(exclude_none=True)
    return JSONResponse(status_code=status_code, content=payload, headers=headers)


def _consume_external_lead_limit(request: Request, *, source_id: int | None = None) -> None:
    settings = get_settings()
    client_ip = resolve_client_ip(request, settings.trusted_proxy_cidrs) or "unknown"
    client_digest = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
    scope = f"source:{source_id}" if source_id is not None else "preauth"
    _external_lead_rate_limiter.consume(
        f"external-lead:{scope}:{client_digest}",
        max_attempts=settings.external_lead_rate_limit_attempts,
        window_seconds=settings.external_lead_rate_limit_window_seconds,
    )


async def _read_bounded_json(request: Request, max_body_bytes: int) -> Any:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise AppError(code="unsupported_media_type", message="Content-Type must be application/json", status_code=415)

    raw_content_length = request.headers.get("content-length")
    if raw_content_length:
        try:
            content_length = int(raw_content_length)
        except ValueError as exc:
            raise AppError(code="validation_error", message="Invalid payload", status_code=422) from exc
        if content_length > max_body_bytes:
            raise AppError(code="payload_too_large", message="Payload is too large", status_code=413)

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > max_body_bytes:
            raise AppError(code="payload_too_large", message="Payload is too large", status_code=413)
    try:
        return json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AppError(code="validation_error", message="Invalid payload", status_code=422) from exc


@router.get(
    "/external-leads/summary",
    response_model=ExternalLeadSummaryRead,
)
def get_external_leads_summary(
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.view")),
) -> ExternalLeadSummaryRead:
    return ExternalLeadService(db).get_summary()


@router.get(
    "/external-leads",
    response_model=list[ExternalLeadListItemRead],
)
def list_external_leads(
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.view")),
) -> list[ExternalLeadListItemRead]:
    return ExternalLeadService(db).list_for_crm(status=status_filter, search=search)


@router.get(
    "/external-leads/{lead_id}",
    response_model=ExternalLeadDetailRead,
)
def get_external_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("orders.view")),
) -> ExternalLeadDetailRead:
    return ExternalLeadService(db).get_for_crm(lead_id)


@router.patch(
    "/external-leads/{lead_id}",
    response_model=ExternalLeadDetailRead,
)
def update_external_lead(
    lead_id: int,
    payload: ExternalLeadStatusUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("orders.edit")),
) -> ExternalLeadDetailRead:
    return ExternalLeadService(db).update_status(lead_id, status=payload.status, actor_user_id=current_user.user.id)


@router.post(
    "/external-leads",
    response_model=ExternalLeadSubmitResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"model": ExternalLeadSubmitResponse},
        401: {"model": ExternalLeadErrorResponse},
        413: {"model": ExternalLeadErrorResponse},
        415: {"model": ExternalLeadErrorResponse},
        429: {"model": ExternalLeadErrorResponse},
        422: {"model": ExternalLeadErrorResponse},
        500: {"model": ExternalLeadErrorResponse},
    },
)
async def create_external_lead(
    request: Request,
    db: Session = Depends(get_db),
    x_integration_key: str | None = Header(default=None, alias="X-Integration-Key"),
) -> ExternalLeadSubmitResponse | JSONResponse:
    service = ExternalLeadService(db)
    try:
        _consume_external_lead_limit(request)
        integration_source = service.authenticate_source(x_integration_key)
        _consume_external_lead_limit(request, source_id=integration_source.id)
        raw_payload = await _read_bounded_json(request, get_settings().external_lead_max_body_bytes)
        result = service.submit_authenticated(
            integration_source=integration_source,
            raw_payload=raw_payload,
            origin=request.headers.get("origin"),
            referer=request.headers.get("referer"),
        )
    except AppError as exc:
        if exc.status_code == 401:
            return _error_response(status_code=401, error="unauthorized")
        if exc.status_code in {413, 415, 429}:
            return _error_response(status_code=exc.status_code, error=exc.code, message=exc.message, headers=exc.headers)
        if exc.code == "validation_error":
            return _error_response(status_code=422, error="validation_error", message=exc.message)
        if 400 <= exc.status_code < 500:
            return _error_response(status_code=exc.status_code, error=exc.code, message=exc.message, headers=exc.headers)
        logger.exception("External lead submission failed with application error")
        return _error_response(status_code=500, error="internal_error")
    except Exception:
        logger.exception("External lead submission failed unexpectedly")
        return _error_response(status_code=500, error="internal_error")

    response = ExternalLeadSubmitResponse(
        success=True,
        leadId=result.lead.id,
        customerId=result.client.id,
        orderId=result.lead.created_order_id,
        status=result.status,
    )
    if result.status == "duplicate":
        return JSONResponse(status_code=200, content=response.model_dump())
    return response
