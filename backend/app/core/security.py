from __future__ import annotations

import hashlib
import hmac
import ipaddress
import secrets
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil
from threading import RLock

from app.core.errors import AppError
from app.core.time import app_now_naive

PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 1024
KNOWN_WEAK_PASSWORDS = frozenset(
    {
        "123456789012",
        "admin-password",
        "admin-pass",
        "example-password",
        "example-password-45",
        "employee-pass",
        "password1234",
        "qwerty123456",
        "user-password",
        "user-pass",
    }
)


def validate_new_password(password: str) -> str:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise AppError(
            code="password_policy_violation",
            message=f"Пароль должен содержать не менее {PASSWORD_MIN_LENGTH} символов",
            status_code=422,
        )
    if len(password) > PASSWORD_MAX_LENGTH:
        raise AppError(
            code="password_policy_violation",
            message=f"Пароль должен содержать не более {PASSWORD_MAX_LENGTH} символов",
            status_code=422,
        )

    normalized = password.strip().casefold()
    if not normalized or normalized in KNOWN_WEAK_PASSWORDS or len(set(normalized)) == 1:
        raise AppError(
            code="password_policy_violation",
            message="Выберите более надёжный пароль или длинную парольную фразу",
            status_code=422,
        )
    return password


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password must not be empty")

    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    computed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        int(iterations),
    )
    return hmac.compare_digest(computed.hex(), digest_hex)


def hash_user_agent(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    value = user_agent.strip()
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_ip_prefix(ip_address: str | None) -> str | None:
    if not ip_address:
        return None
    try:
        ip_obj = ipaddress.ip_address(ip_address.strip())
    except ValueError:
        return None

    if ip_obj.version == 4:
        network = ipaddress.ip_network(f"{ip_obj}/24", strict=False)
        return str(network.network_address) + "/24"

    network = ipaddress.ip_network(f"{ip_obj}/56", strict=False)
    return str(network.network_address) + "/56"


@dataclass(slots=True)
class RateLimitWindow:
    attempts: deque[datetime]
    locked_until: datetime | None = None


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._windows: dict[str, RateLimitWindow] = {}
        self._lock = RLock()

    def assert_allowed(self, key: str, *, max_attempts: int, window_seconds: int) -> None:
        now = app_now_naive()
        with self._lock:
            window = self._windows.setdefault(key, RateLimitWindow(attempts=deque()))
            self._assert_window_allowed(window, now=now, max_attempts=max_attempts, window_seconds=window_seconds)

    def consume(self, key: str, *, max_attempts: int, window_seconds: int) -> None:
        now = app_now_naive()
        with self._lock:
            window = self._windows.setdefault(key, RateLimitWindow(attempts=deque()))
            self._assert_window_allowed(window, now=now, max_attempts=max_attempts, window_seconds=window_seconds)
            window.attempts.append(now)

    def register_failure(self, key: str, *, max_attempts: int, window_seconds: int) -> None:
        now = app_now_naive()
        with self._lock:
            window = self._windows.setdefault(key, RateLimitWindow(attempts=deque()))
            self._trim(window.attempts, now=now, window_seconds=window_seconds)
            window.attempts.append(now)
            if len(window.attempts) >= max_attempts:
                window.locked_until = now + timedelta(seconds=window_seconds)

    def reset(self, key: str) -> None:
        with self._lock:
            self._windows.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._windows.clear()

    def _assert_window_allowed(
        self,
        window: RateLimitWindow,
        *,
        now: datetime,
        max_attempts: int,
        window_seconds: int,
    ) -> None:
        if window.locked_until and window.locked_until > now:
            self._raise_rate_limited(window.locked_until, now)
        if window.locked_until and window.locked_until <= now:
            window.locked_until = None
        self._trim(window.attempts, now=now, window_seconds=window_seconds)
        if len(window.attempts) >= max_attempts:
            window.locked_until = now + timedelta(seconds=window_seconds)
            self._raise_rate_limited(window.locked_until, now)

    @staticmethod
    def _raise_rate_limited(locked_until: datetime, now: datetime) -> None:
        retry_after = max(1, ceil((locked_until - now).total_seconds()))
        raise AppError(
            code="rate_limited",
            message="Слишком много попыток. Попробуйте позже",
            status_code=429,
            headers={"Retry-After": str(retry_after)},
        )

    @staticmethod
    def _trim(items: deque[datetime], *, now: datetime, window_seconds: int) -> None:
        threshold = now - timedelta(seconds=window_seconds)
        while items and items[0] <= threshold:
            items.popleft()
