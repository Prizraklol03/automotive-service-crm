from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.core.request_context import set_request_security_context
from app.core.security import InMemoryRateLimiter, hash_password, hash_user_agent, normalize_ip_prefix, verify_password
from app.core.time import app_now_naive
from app.crm.models.user import CrmUser
from app.crm.models.user_session import CrmUserSession
from app.crm.repositories.user_repository import UserRepository
from app.crm.repositories.user_session_repository import UserSessionRepository
from app.crm.schemas.auth import DeviceType, LoginRequest
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.session_service import SessionTokenService


logger = get_logger(__name__)
_login_rate_limiter = InMemoryRateLimiter()
_refresh_rate_limiter = InMemoryRateLimiter()
_DUMMY_PASSWORD_HASH = hash_password("timing-only-password-placeholder")


def reset_auth_rate_limiters() -> None:
    _login_rate_limiter.clear()
    _refresh_rate_limiter.clear()


def consume_refresh_rate_limit(ip_address: str | None) -> None:
    settings = get_settings()
    client_digest = hashlib.sha256((ip_address or "unknown").strip().encode("utf-8")).hexdigest()
    _refresh_rate_limiter.consume(
        f"refresh:{client_digest}",
        max_attempts=settings.auth_refresh_rate_limit_attempts,
        window_seconds=settings.auth_refresh_rate_limit_window_seconds,
    )


@dataclass(slots=True)
class AuthTokens:
    access_token: str
    refresh_token: str | None
    token_type: str
    expires_in: int
    session: CrmUserSession


class AuthService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.user_sessions = UserSessionRepository(session)
        self.audit_logs = AuditLogService(session)

    def authenticate(self, login: str, password: str) -> CrmUser:
        user = self.users.get_by_login(login.strip())
        password_hash = user.password_hash if user and user.is_active else _DUMMY_PASSWORD_HASH
        password_matches = verify_password(password, password_hash)
        if not user or not user.is_active or not password_matches:
            raise AppError(code="auth_failed", message="Неверный логин или пароль", status_code=401)
        return user

    def login(
        self,
        payload: LoginRequest,
        token_service: SessionTokenService,
        *,
        ip_address: str | None,
        user_agent: str | None,
    ) -> AuthTokens:
        self._enforce_login_rate_limit(login=payload.login, ip_address=ip_address)
        try:
            user = self.authenticate(payload.login, payload.password)
        except AppError:
            self._register_login_failure(login=payload.login, ip_address=ip_address)
            raise
        self._clear_login_rate_limit(login=payload.login, ip_address=ip_address)
        now = app_now_naive()
        family_id = uuid4().hex
        ip_prefix = normalize_ip_prefix(ip_address)
        user_agent_hash = hash_user_agent(user_agent)
        session_row = CrmUserSession(
            user_id=user.id,
            refresh_token_hash="pending",
            token_family_id=family_id,
            device_type=payload.device_type,
            device_name=self._resolve_device_name(payload.device_type, payload.device_name, user_agent),
            user_agent=self._truncate(user_agent, 1000),
            ip_address=self._truncate(ip_address, 128),
            user_agent_hash=user_agent_hash,
            ip_prefix=ip_prefix,
            created_at=now,
            last_used_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=token_service.refresh_inactivity_ttl_days),
            absolute_expires_at=now + timedelta(days=token_service.refresh_absolute_ttl_days),
            revoked_at=None,
            revoke_reason=None,
            replaced_by_session_id=None,
        )
        self.user_sessions.create(session_row)
        refresh_token = token_service.issue_refresh_token(
            user_id=user.id,
            session_id=session_row.id,
            token_family_id=session_row.token_family_id,
            token_version=user.token_version,
            absolute_expires_at=session_row.absolute_expires_at,
        )
        session_row.refresh_token_hash = token_service.hash_refresh_token(refresh_token)
        access_payload = token_service.issue_access_token(
            user_id=user.id,
            role_code=user.role.code,
            login=user.login,
            token_version=user.token_version,
            session_id=session_row.id,
        )
        self.audit_logs.record(
            actor_user_id=user.id,
            entity_type="auth_session",
            entity_id=session_row.id,
            action="login",
            title=f"Вход в систему с устройства {session_row.device_name or session_row.device_type}",
            description=session_row.ip_address,
        )
        set_request_security_context(ip_prefix=ip_prefix, user_agent_hash=user_agent_hash)
        self.session.commit()
        self.session.refresh(session_row)
        logger.info("User %s logged in with session %s (%s)", user.login, session_row.id, session_row.device_type)
        return AuthTokens(
            access_token=str(access_payload["access_token"]),
            refresh_token=refresh_token,
            token_type=str(access_payload["token_type"]),
            expires_in=int(access_payload["expires_in"]),
            session=session_row,
        )

    def resolve_access_user(
        self,
        access_token: str,
        token_service: SessionTokenService,
        *,
        request_ip: str | None,
        request_user_agent: str | None,
    ) -> tuple[CrmUser, CrmUserSession, dict[str, object]]:
        payload = token_service.verify_access_token(access_token)
        user = self.users.get_by_id(int(payload["sub"]))
        if not user or not user.is_active:
            raise AppError(code="auth_failed", message="Пользователь не найден или отключён", status_code=401)
        if int(payload.get("ver", 0)) != user.token_version:
            raise AppError(code="auth_failed", message="Сессия отозвана. Войдите заново", status_code=401)

        raw_session = self.user_sessions.get_by_id(int(payload["sid"]))
        if raw_session is None or raw_session.user_id != user.id:
            raise AppError(code="auth_failed", message="Сессия недействительна", status_code=401)

        active_session = self._resolve_access_session(raw_session)
        if active_session is None:
            raise AppError(code="auth_failed", message="Сессия недействительна", status_code=401)
        self._assert_session_fingerprint(active_session, request_ip=request_ip, request_user_agent=request_user_agent)
        active_session.last_seen_at = app_now_naive()
        self.session.commit()
        return user, active_session, payload

    def refresh_session(
        self,
        refresh_token: str,
        token_service: SessionTokenService,
        *,
        ip_address: str | None,
        user_agent: str | None,
    ) -> AuthTokens:
        try:
            payload = token_service.verify_refresh_token(refresh_token)
        except AppError:
            logger.warning("Refresh failed: invalid token signature or expiry")
            raise

        user = self.users.get_by_id(int(payload["sub"]))
        session_row = self.user_sessions.get_by_id(int(payload["sid"]))
        now = app_now_naive()

        if not user or session_row is None or session_row.user_id != user.id:
            logger.warning("Refresh failed: session %s not found", payload.get("sid"))
            raise AppError(code="auth_failed", message="Сессия недействительна. Войдите заново", status_code=401)

        if not user.is_active:
            logger.warning("Refresh failed: disabled user %s", user.login)
            raise AppError(code="auth_failed", message="Сессия недействительна. Войдите заново", status_code=401)

        if int(payload.get("ver", 0)) != user.token_version:
            self._revoke_family(session_row.token_family_id, reason="token_version_revoked")
            self.session.commit()
            logger.warning("Refresh failed: token version mismatch for user %s", user.login)
            raise AppError(code="auth_failed", message="Сессия отозвана. Войдите заново", status_code=401)

        if session_row.refresh_token_hash != token_service.hash_refresh_token(refresh_token):
            logger.warning("Refresh failed: token hash mismatch for session %s", session_row.id)
            raise AppError(code="auth_failed", message="Сессия недействительна. Войдите заново", status_code=401)

        if session_row.revoked_at is not None:
            if session_row.revoke_reason == "rotated":
                # Grace period: if the token was rotated very recently, this is likely a concurrent
                # refresh from multiple browser tabs — not a replay attack. Return a special error
                # code so the client can retry (the cookie already has the new token by then).
                grace_seconds = 30
                time_since_rotation = (now - session_row.revoked_at).total_seconds()
                if session_row.device_type == "web" and time_since_rotation <= grace_seconds:
                    logger.info(
                        "Concurrent refresh for user %s session %s (%.1fs ago), returning retry hint",
                        user.login, session_row.id, time_since_rotation,
                    )
                    raise AppError(code="refresh_concurrent", message="Сессия обновляется. Повторите запрос", status_code=401)
                self._revoke_family(session_row.token_family_id, reason="replay_detected")
                self.audit_logs.record(
                    actor_user_id=user.id,
                    entity_type="auth_session",
                    entity_id=session_row.id,
                    action="refresh_reuse_detected",
                    title="Обнаружено повторное использование refresh token",
                    description=session_row.device_name,
                )
                self.session.commit()
                logger.warning("Refresh replay detected for user %s family %s", user.login, session_row.token_family_id)
            raise AppError(code="auth_failed", message="Сессия недействительна. Войдите заново", status_code=401)

        expiry_reason = self._get_session_expiry_reason(session_row, now)
        if expiry_reason:
            self._revoke_session_row(session_row, reason=expiry_reason, revoke_time=now)
            self.session.commit()
            logger.warning("Refresh failed: session %s expired with reason %s", session_row.id, expiry_reason)
            raise AppError(code="auth_failed", message="Сессия истекла. Войдите заново", status_code=401)

        new_session = CrmUserSession(
            user_id=user.id,
            refresh_token_hash="pending",
            token_family_id=session_row.token_family_id,
            device_type=session_row.device_type,
            device_name=session_row.device_name,
            user_agent=self._truncate(user_agent or session_row.user_agent, 1000),
            ip_address=self._truncate(ip_address or session_row.ip_address, 128),
            user_agent_hash=hash_user_agent(user_agent or session_row.user_agent),
            ip_prefix=normalize_ip_prefix(ip_address or session_row.ip_address),
            created_at=now,
            last_used_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=token_service.refresh_inactivity_ttl_days),
            absolute_expires_at=session_row.absolute_expires_at,
            revoked_at=None,
            revoke_reason=None,
            replaced_by_session_id=None,
        )
        self.user_sessions.create(new_session)
        new_refresh_token = token_service.issue_refresh_token(
            user_id=user.id,
            session_id=new_session.id,
            token_family_id=new_session.token_family_id,
            token_version=user.token_version,
            absolute_expires_at=new_session.absolute_expires_at,
        )
        new_session.refresh_token_hash = token_service.hash_refresh_token(new_refresh_token)

        session_row.last_used_at = now
        session_row.last_seen_at = now
        session_row.revoked_at = now
        session_row.revoke_reason = "rotated"
        session_row.replaced_by_session_id = new_session.id

        access_payload = token_service.issue_access_token(
            user_id=user.id,
            role_code=user.role.code,
            login=user.login,
            token_version=user.token_version,
            session_id=new_session.id,
        )
        self.audit_logs.record(
            actor_user_id=user.id,
            entity_type="auth_session",
            entity_id=new_session.id,
            action="refresh",
            title="Сессия обновлена",
            description=new_session.device_name,
        )
        self.session.commit()
        self.session.refresh(new_session)
        set_request_security_context(ip_prefix=new_session.ip_prefix, user_agent_hash=new_session.user_agent_hash)
        logger.info("Refresh rotated session %s -> %s for user %s", session_row.id, new_session.id, user.login)
        return AuthTokens(
            access_token=str(access_payload["access_token"]),
            refresh_token=new_refresh_token,
            token_type=str(access_payload["token_type"]),
            expires_in=int(access_payload["expires_in"]),
            session=new_session,
        )

    def list_sessions(self, *, user_id: int, current_session_id: int | None = None) -> list[CrmUserSession]:
        now = app_now_naive()
        return self.user_sessions.list_active_by_user_id(user_id, now=now)

    def logout_current(self, *, user: CrmUser, current_session: CrmUserSession) -> int:
        revoked = self._revoke_family(current_session.token_family_id, reason="logout")
        self.audit_logs.record(
            actor_user_id=user.id,
            entity_type="auth_session",
            entity_id=current_session.id,
            action="logout",
            title="Выход из текущего устройства",
            description=current_session.device_name,
        )
        self.session.commit()
        return revoked

    def logout_all(self, *, user: CrmUser) -> int:
        revoked = 0
        for session_row in self.user_sessions.list_active_by_user_id(user.id, now=app_now_naive()):
            revoked += self._revoke_family(session_row.token_family_id, reason="logout_all")
        self.audit_logs.record(
            actor_user_id=user.id,
            entity_type="auth_session",
            entity_id=None,
            action="logout_all",
            title="Выход со всех устройств",
            description=None,
        )
        self.session.commit()
        return revoked

    def revoke_device(self, *, actor_user: CrmUser, target_session_id: int) -> int:
        target_session = self.user_sessions.get_by_id(target_session_id)
        if target_session is None or target_session.user_id != actor_user.id:
            raise AppError(code="not_found", message="Сессия не найдена", status_code=404)
        revoked = self._revoke_family(target_session.token_family_id, reason="device_revoked")
        self.audit_logs.record(
            actor_user_id=actor_user.id,
            entity_type="auth_session",
            entity_id=target_session.id,
            action="revoke_device",
            title="Устройство отключено",
            description=target_session.device_name,
        )
        self.session.commit()
        return revoked

    def revoke_all_for_user(
        self,
        *,
        user: CrmUser,
        actor_user_id: int | None,
        increment_token_version: bool,
        commit: bool = True,
    ) -> int:
        revoked = 0
        for session_row in self.user_sessions.list_active_by_user_id(user.id, now=app_now_naive()):
            revoked += self._revoke_family(session_row.token_family_id, reason="admin_revoke_all")
        if increment_token_version:
            user.token_version += 1
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="user",
            entity_id=user.id,
            action="revoke_sessions",
            title=f"Отозваны все сессии пользователя {user.full_name}",
            description=f"Логин: {user.login}",
        )
        if commit:
            self.session.commit()
        return revoked

    def revoke_all_for_password_reset(self, *, user: CrmUser, actor_user_id: int | None) -> int:
        revoked = 0
        for session_row in self.user_sessions.list_active_by_user_id(user.id, now=app_now_naive()):
            revoked += self._revoke_family(session_row.token_family_id, reason="password_reset")
        user.token_version += 1
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="user",
            entity_id=user.id,
            action="revoke_sessions",
            title=f"Сессии пользователя {user.full_name} отозваны после сброса пароля",
            description=f"Логин: {user.login}",
        )
        self.session.commit()
        return revoked

    def _resolve_access_session(self, session_row: CrmUserSession) -> CrmUserSession | None:
        now = app_now_naive()
        expiry_reason = self._get_session_expiry_reason(session_row, now)
        if expiry_reason and session_row.revoked_at is None:
            self._revoke_session_row(session_row, reason=expiry_reason, revoke_time=now)
            self.session.commit()
            return None
        if session_row.revoked_at is None:
            return session_row
        if session_row.revoke_reason == "rotated":
            return self.user_sessions.get_active_by_family_id(session_row.token_family_id, now=now)
        return None

    @staticmethod
    def _get_session_expiry_reason(session_row: CrmUserSession, now) -> str | None:
        if session_row.absolute_expires_at <= now:
            return "absolute_expired"
        if session_row.expires_at <= now:
            return "inactive_expired"
        return None

    @staticmethod
    def _resolve_device_name(device_type: DeviceType, device_name: str | None, user_agent: str | None) -> str:
        if device_name and device_name.strip():
            return device_name.strip()[:255]
        if user_agent and user_agent.strip():
            return user_agent.strip()[:255]
        return "Web browser" if device_type == "web" else "Mobile device"

    @staticmethod
    def _truncate(value: str | None, max_length: int) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        return value[:max_length]

    @staticmethod
    def _revoke_session_row(session_row: CrmUserSession, *, reason: str, revoke_time) -> bool:
        changed = False
        if session_row.revoked_at is None:
            session_row.revoked_at = revoke_time
            changed = True
        if session_row.revoke_reason is None or session_row.revoke_reason == "rotated":
            session_row.revoke_reason = reason
            changed = True
        return changed

    def _revoke_family(self, token_family_id: str, *, reason: str) -> int:
        revoked_count = 0
        revoke_time = app_now_naive()
        for session_row in self.user_sessions.list_family_members(token_family_id):
            if self._revoke_session_row(session_row, reason=reason, revoke_time=revoke_time):
                revoked_count += 1
        return revoked_count

    def _assert_session_fingerprint(
        self,
        session_row: CrmUserSession,
        *,
        request_ip: str | None,
        request_user_agent: str | None,
    ) -> None:
        request_ip_prefix = normalize_ip_prefix(request_ip)
        request_user_agent_hash = hash_user_agent(request_user_agent)
        if session_row.ip_prefix and request_ip_prefix and session_row.ip_prefix != request_ip_prefix:
            self._revoke_family(session_row.token_family_id, reason="suspicious_ip_change")
            self.session.commit()
            raise AppError(code="auth_failed", message="Сессия отозвана. Войдите заново", status_code=401)
        if session_row.user_agent_hash and request_user_agent_hash and session_row.user_agent_hash != request_user_agent_hash:
            self._revoke_family(session_row.token_family_id, reason="suspicious_user_agent_change")
            self.session.commit()
            raise AppError(code="auth_failed", message="Сессия отозвана. Войдите заново", status_code=401)

    @staticmethod
    def _login_rate_limit_keys(*, login: str, ip_address: str | None) -> tuple[str, str]:
        login_digest = hashlib.sha256(login.strip().casefold().encode("utf-8")).hexdigest()
        client_digest = hashlib.sha256((ip_address or "unknown").strip().encode("utf-8")).hexdigest()
        return (f"login-account:{login_digest}", f"login-client:{client_digest}")

    def _enforce_login_rate_limit(self, *, login: str, ip_address: str | None) -> None:
        settings = get_settings()
        for key in self._login_rate_limit_keys(login=login, ip_address=ip_address):
            _login_rate_limiter.assert_allowed(
                key,
                max_attempts=settings.auth_login_rate_limit_attempts,
                window_seconds=settings.auth_login_rate_limit_window_seconds,
            )

    def _clear_login_rate_limit(self, *, login: str, ip_address: str | None) -> None:
        account_key, _ = self._login_rate_limit_keys(login=login, ip_address=ip_address)
        _login_rate_limiter.reset(account_key)

    def _register_login_failure(self, *, login: str, ip_address: str | None) -> None:
        settings = get_settings()
        for key in self._login_rate_limit_keys(login=login, ip_address=ip_address):
            _login_rate_limiter.register_failure(
                key,
                max_attempts=settings.auth_login_rate_limit_attempts,
                window_seconds=settings.auth_login_rate_limit_window_seconds,
            )
