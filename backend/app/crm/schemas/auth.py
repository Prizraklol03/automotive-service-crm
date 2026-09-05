from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DeviceType = Literal["web", "mobile"]


class LoginRequest(BaseModel):
    login: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)
    device_type: DeviceType = "mobile"
    device_name: str | None = Field(default=None, max_length=255)


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=1)


class AuthSessionRead(BaseModel):
    id: int
    device_type: DeviceType
    device_name: str | None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    absolute_expires_at: datetime
    is_current: bool


class TokenPairRead(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str
    expires_in: int
    session_id: int
    refresh_expires_at: datetime
    refresh_absolute_expires_at: datetime
    device_type: DeviceType


class CurrentUserRead(BaseModel):
    id: int
    login: str
    full_name: str
    role_code: str
    is_active: bool


class CurrentUserEnvelopeRead(BaseModel):
    user: CurrentUserRead
    permissions: list[str] = Field(default_factory=list)


class SessionActionRead(BaseModel):
    status: str
    revoked_session_id: int | None = None
    revoked_sessions_count: int = 0


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=1, max_length=1024)
