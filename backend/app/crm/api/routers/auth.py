from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Cookie, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.client_ip import resolve_client_ip
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.time import app_now_naive, get_app_timezone
from app.crm.api.deps import CurrentUserContext, get_current_user, get_session_token_service
from app.crm.schemas.auth import AuthSessionRead, CurrentUserEnvelopeRead, CurrentUserRead, LoginRequest, RefreshRequest, SessionActionRead, TokenPairRead
from app.crm.services.auth_service import AuthService, consume_refresh_rate_limit
from app.crm.services.permission_service import UserPermissionService
from app.crm.services.session_service import SessionTokenService

router = APIRouter()


def _set_refresh_cookie(response: Response, refresh_token: str, refresh_expires_at: datetime) -> None:
    settings = get_settings()
    aware_refresh_expires_at = refresh_expires_at.replace(tzinfo=get_app_timezone()).astimezone(UTC)
    max_age = max(int((refresh_expires_at - app_now_naive()).total_seconds()), 0)
    response.set_cookie(
        key=settings.auth_refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.auth_refresh_cookie_secure,
        samesite=settings.auth_refresh_cookie_samesite,
        path="/",
        expires=aware_refresh_expires_at,
        max_age=max_age,
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.auth_refresh_cookie_name,
        path="/",
        samesite=settings.auth_refresh_cookie_samesite,
    )


def _resolve_refresh_token(payload: RefreshRequest | None, refresh_cookie: str | None) -> str:
    token = (payload.refresh_token if payload else None) or refresh_cookie
    if not token:
        raise AppError(code="auth_failed", message="Требуется refresh token", status_code=401)
    return token


def _to_token_response(tokens, *, expose_refresh_token: bool) -> TokenPairRead:
    return TokenPairRead(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token if expose_refresh_token else None,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        session_id=tokens.session.id,
        refresh_expires_at=tokens.session.expires_at,
        refresh_absolute_expires_at=tokens.session.absolute_expires_at,
        device_type=tokens.session.device_type,
    )


@router.post("/login", response_model=TokenPairRead)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    token_service: SessionTokenService = Depends(get_session_token_service),
) -> TokenPairRead:
    tokens = AuthService(db).login(
        payload,
        token_service,
        ip_address=resolve_client_ip(request, get_settings().trusted_proxy_cidrs),
        user_agent=request.headers.get("user-agent"),
    )
    if tokens.session.device_type == "web" and tokens.refresh_token:
        _set_refresh_cookie(response, tokens.refresh_token, tokens.session.expires_at)
    return _to_token_response(tokens, expose_refresh_token=tokens.session.device_type == "mobile")


@router.post("/refresh", response_model=TokenPairRead)
def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = Body(default=None),
    refresh_cookie: str | None = Cookie(default=None, alias=get_settings().auth_refresh_cookie_name),
    db: Session = Depends(get_db),
    token_service: SessionTokenService = Depends(get_session_token_service),
) -> TokenPairRead:
    client_ip = resolve_client_ip(request, get_settings().trusted_proxy_cidrs)
    consume_refresh_rate_limit(client_ip)
    refresh_token = _resolve_refresh_token(payload, refresh_cookie)
    auth_service = AuthService(db)
    tokens = auth_service.refresh_session(
        refresh_token,
        token_service,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
    )
    if tokens.session.device_type == "web" and tokens.refresh_token:
        _set_refresh_cookie(response, tokens.refresh_token, tokens.session.expires_at)
    return _to_token_response(tokens, expose_refresh_token=tokens.session.device_type == "mobile")


@router.post("/logout", response_model=SessionActionRead)
def logout(
    response: Response,
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionActionRead:
    revoked_count = AuthService(db).logout_current(user=current_user.user, current_session=current_user.session)
    _clear_refresh_cookie(response)
    return SessionActionRead(status="ok", revoked_session_id=current_user.session.id, revoked_sessions_count=revoked_count)


@router.post("/logout-all", response_model=SessionActionRead)
def logout_all(
    response: Response,
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionActionRead:
    revoked_count = AuthService(db).logout_all(user=current_user.user)
    _clear_refresh_cookie(response)
    return SessionActionRead(status="ok", revoked_sessions_count=revoked_count)


@router.get("/sessions", response_model=list[AuthSessionRead])
def list_sessions(
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuthSessionRead]:
    sessions = AuthService(db).list_sessions(user_id=current_user.user.id, current_session_id=current_user.session.id)
    return [
        AuthSessionRead(
            id=session_row.id,
            device_type=session_row.device_type,
            device_name=session_row.device_name,
            created_at=session_row.created_at,
            last_used_at=session_row.last_used_at,
            expires_at=session_row.expires_at,
            absolute_expires_at=session_row.absolute_expires_at,
            is_current=session_row.id == current_user.session.id,
        )
        for session_row in sessions
    ]


@router.delete("/sessions/{session_id}", response_model=SessionActionRead)
def revoke_device_session(
    session_id: int,
    response: Response,
    current_user: CurrentUserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionActionRead:
    revoked_count = AuthService(db).revoke_device(actor_user=current_user.user, target_session_id=session_id)
    if session_id == current_user.session.id:
        _clear_refresh_cookie(response)
    return SessionActionRead(status="ok", revoked_session_id=session_id, revoked_sessions_count=revoked_count)


@router.get("/me", response_model=CurrentUserEnvelopeRead)
def me(current_user: CurrentUserContext = Depends(get_current_user), db: Session = Depends(get_db)) -> CurrentUserEnvelopeRead:
    return UserPermissionService(db).get_current_user_envelope(current_user.user)
