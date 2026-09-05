from pydantic import Field, model_validator

from app.crm.schemas.audit_log import AuditLogRead
from app.crm.schemas.common import CrmSchema


class RoleCreate(CrmSchema):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=128)


class RoleRead(CrmSchema):
    id: int
    code: str
    name: str


class UserCreate(CrmSchema):
    role_id: int | None = None
    role_code: str | None = Field(default=None, min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=255)
    login: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_role_reference(self) -> "UserCreate":
        if self.role_id is None and self.role_code is None:
            raise ValueError("role_id or role_code is required")
        return self


class UserUpdate(CrmSchema):
    role_id: int | None = None
    role_code: str | None = Field(default=None, min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=255)
    login: str = Field(min_length=1, max_length=128)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_role_reference(self) -> "UserUpdate":
        if self.role_id is None and self.role_code is None:
            raise ValueError("role_id or role_code is required")
        return self


class UserStatusUpdate(CrmSchema):
    is_active: bool


class UserPasswordReset(CrmSchema):
    new_password: str = Field(min_length=1, max_length=1024)


class UserRead(CrmSchema):
    id: int
    role_id: int
    role_code: str
    full_name: str
    login: str
    token_version: int
    is_active: bool


class UserActivityFeedRead(CrmSchema):
    user_id: int
    activities: list[AuditLogRead]
