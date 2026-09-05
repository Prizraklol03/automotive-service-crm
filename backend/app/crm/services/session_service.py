from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from base64 import urlsafe_b64decode, urlsafe_b64encode
from binascii import Error as BinasciiError
from datetime import UTC, datetime, timedelta

from app.core.errors import AppError
from app.core.time import get_app_timezone


def _b64encode(data: bytes) -> str:
    return urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return urlsafe_b64decode(value + padding)


def _to_utc_timestamp(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=get_app_timezone())
    return int(value.astimezone(UTC).timestamp())


class SessionTokenService:
    def __init__(
        self,
        *,
        secret_key: str,
        access_ttl_minutes: int,
        refresh_inactivity_ttl_days: int,
        refresh_absolute_ttl_days: int,
    ) -> None:
        self.secret_key = secret_key.encode("utf-8")
        self.access_ttl_minutes = access_ttl_minutes
        self.refresh_inactivity_ttl_days = refresh_inactivity_ttl_days
        self.refresh_absolute_ttl_days = refresh_absolute_ttl_days

    def _sign(self, signing_input: str) -> str:
        signature = hmac.new(self.secret_key, signing_input.encode("ascii"), hashlib.sha256).digest()
        return _b64encode(signature)

    def _encode_jwt(self, payload: dict[str, object]) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        header_part = _b64encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        payload_part = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signing_input = f"{header_part}.{payload_part}"
        return f"{signing_input}.{self._sign(signing_input)}"

    def _decode_jwt(self, token: str) -> dict[str, object]:
        try:
            header_part, payload_part, signature_part = token.split(".", 2)
            header = json.loads(_b64decode(header_part).decode("utf-8"))
            if not isinstance(header, dict) or header.get("alg") != "HS256" or header.get("typ") != "JWT":
                raise ValueError("unsupported JWT header")
        except (BinasciiError, UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            raise AppError(code="auth_failed", message="Недействительный токен", status_code=401) from exc

        signing_input = f"{header_part}.{payload_part}"
        if not hmac.compare_digest(self._sign(signing_input), signature_part):
            raise AppError(code="auth_failed", message="Недействительный токен", status_code=401)

        try:
            payload = json.loads(_b64decode(payload_part).decode("utf-8"))
            if not isinstance(payload, dict) or isinstance(payload.get("exp"), bool) or not isinstance(payload.get("exp"), int):
                raise ValueError("invalid JWT payload")
            expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
        except (BinasciiError, OverflowError, OSError, TypeError, UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            raise AppError(code="auth_failed", message="Invalid token", status_code=401) from exc
        if expires_at <= datetime.now(UTC):
            raise AppError(code="auth_failed", message="Срок действия токена истёк", status_code=401)
        return payload

    def issue_access_token(
        self,
        *,
        user_id: int,
        role_code: str,
        login: str,
        token_version: int,
        session_id: int,
    ) -> dict[str, str | int]:
        now = datetime.now(UTC)
        payload = {
            "sub": user_id,
            "role": role_code,
            "login": login,
            "ver": token_version,
            "sid": session_id,
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=self.access_ttl_minutes)).timestamp()),
        }
        return {
            "access_token": self._encode_jwt(payload),
            "token_type": "bearer",
            "expires_in": self.access_ttl_minutes * 60,
        }

    def issue_refresh_token(
        self,
        *,
        user_id: int,
        session_id: int,
        token_family_id: str,
        token_version: int,
        absolute_expires_at: datetime,
    ) -> str:
        now = datetime.now(UTC)
        payload = {
            "sub": user_id,
            "sid": session_id,
            "fam": token_family_id,
            "ver": token_version,
            "jti": secrets.token_hex(16),
            "type": "refresh",
            "iat": int(now.timestamp()),
            "exp": _to_utc_timestamp(absolute_expires_at),
        }
        return self._encode_jwt(payload)

    def hash_refresh_token(self, refresh_token: str) -> str:
        return hmac.new(self.secret_key, refresh_token.encode("utf-8"), hashlib.sha256).hexdigest()

    @staticmethod
    def _has_required_claims(payload: dict[str, object], *, token_type: str) -> bool:
        if payload.get("type") != token_type:
            return False
        for claim in ("sub", "sid", "ver"):
            value = payload.get(claim)
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                return False
        return True

    def verify_access_token(self, token: str) -> dict[str, object]:
        payload = self._decode_jwt(token)
        if not self._has_required_claims(payload, token_type="access"):
            raise AppError(code="auth_failed", message="Недействительный access token", status_code=401)
        return payload

    def verify_refresh_token(self, refresh_token: str) -> dict[str, object]:
        payload = self._decode_jwt(refresh_token)
        if not self._has_required_claims(payload, token_type="refresh"):
            raise AppError(code="auth_failed", message="Недействительный refresh token", status_code=401)
        return payload
