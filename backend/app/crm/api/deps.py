from __future__ import annotations

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.client_ip import resolve_client_ip
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.request_context import set_request_security_context
from app.core.security import hash_user_agent, normalize_ip_prefix
from app.crm.auth.permissions import get_effective_permissions, has_permission, validate_permission_code
from app.crm.models.user import CrmUser
from app.crm.models.user_session import CrmUserSession
from app.crm.services.auth_service import AuthService
from app.crm.services.session_service import SessionTokenService
from app.db.session import get_db_session


class CurrentUserContext:
    def __init__(
        self,
        user: CrmUser,
        session: CrmUserSession,
        access_payload: dict[str, object],
        permissions: set[str],
    ) -> None:
        self.user = user
        self.session = session
        self.role_code = user.role.code
        self.access_payload = access_payload
        self.permissions = permissions


def get_session_token_service() -> SessionTokenService:
    settings = get_settings()
    return SessionTokenService(
        secret_key=settings.auth_secret_key,
        access_ttl_minutes=settings.auth_access_token_ttl_minutes,
        refresh_inactivity_ttl_days=settings.auth_refresh_inactivity_ttl_days,
        refresh_absolute_ttl_days=settings.auth_refresh_absolute_ttl_days,
    )


def get_db() -> Session:
    yield from get_db_session()


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    token_service: SessionTokenService = Depends(get_session_token_service),
) -> CurrentUserContext:
    if not authorization:
        raise AppError(code="auth_failed", message="Требуется авторизация", status_code=401)
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError(code="auth_failed", message="Некорректный заголовок авторизации", status_code=401)

    user, session_row, payload = AuthService(db).resolve_access_user(
        token,
        token_service,
        request_ip=resolve_client_ip(request, get_settings().trusted_proxy_cidrs),
        request_user_agent=request.headers.get("user-agent"),
    )
    set_request_security_context(ip_prefix=session_row.ip_prefix, user_agent_hash=session_row.user_agent_hash)
    return CurrentUserContext(user, session_row, payload, get_effective_permissions(user))


def require_roles(*role_codes: str):
    def dependency(current_user: CurrentUserContext = Depends(get_current_user)) -> CurrentUserContext:
        if current_user.role_code not in role_codes:
            raise AppError(code="forbidden", message="Недостаточно прав", status_code=403)
        return current_user

    return dependency


def require_permission(permission_code: str):
    if not validate_permission_code(permission_code):
        raise AppError(code="validation_error", message="Неизвестный permission_code", status_code=422)

    def dependency(current_user: CurrentUserContext = Depends(get_current_user)) -> CurrentUserContext:
        if not has_permission(current_user.user, permission_code):
            raise AppError(code="forbidden", message="Недостаточно прав", status_code=403)
        return current_user

    return dependency


def require_all_permissions(*permission_codes: str):
    for permission_code in permission_codes:
        if not validate_permission_code(permission_code):
            raise AppError(code="validation_error", message="Unknown permission code", status_code=422)

    def dependency(current_user: CurrentUserContext = Depends(get_current_user)) -> CurrentUserContext:
        for permission_code in permission_codes:
            if not has_permission(current_user.user, permission_code):
                raise AppError(code="forbidden", message="Insufficient permissions", status_code=403)
        return current_user

    return dependency
