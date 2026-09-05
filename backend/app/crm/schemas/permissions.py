from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.crm.auth.permissions import validate_permission_code


class PermissionStateRead(BaseModel):
    permission_code: str
    is_allowed: bool


class PermissionStateUpdate(PermissionStateRead):
    @field_validator("permission_code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        if not validate_permission_code(value):
            raise ValueError("unknown permission_code")
        return value


class PermissionUserRead(BaseModel):
    id: int
    login: str
    full_name: str
    role_code: str
    is_active: bool


class CurrentUserEnvelopeRead(BaseModel):
    user: PermissionUserRead
    permissions: list[str] = Field(default_factory=list)


class UserPermissionsRead(BaseModel):
    user: PermissionUserRead
    permissions: list[PermissionStateRead] = Field(default_factory=list)


class UserPermissionsUpdateRequest(BaseModel):
    permissions: list[PermissionStateUpdate] = Field(default_factory=list)
