from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.auth.permissions import ALL_PERMISSION_CODES, DEFAULT_STANDARD_USER_PERMISSION_CODES, get_effective_permissions
from app.crm.models.user import CrmUser
from app.crm.models.user_permission import CrmUserPermission
from app.crm.repositories.user_repository import UserRepository
from app.crm.schemas.permissions import (
    CurrentUserEnvelopeRead,
    PermissionStateRead,
    PermissionUserRead,
    UserPermissionsRead,
    UserPermissionsUpdateRequest,
)


class UserPermissionService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)

    def _get_user(self, user_id: int) -> CrmUser:
        user = self.users.get_by_id(user_id)
        if not user:
            raise AppError(code="not_found", message="Пользователь не найден", status_code=404)
        return user

    @staticmethod
    def _to_user_read(user: CrmUser) -> PermissionUserRead:
        return PermissionUserRead(
            id=user.id,
            login=user.login,
            full_name=user.full_name,
            role_code=user.role.code,
            is_active=user.is_active,
        )

    def get_current_user_envelope(self, user: CrmUser) -> CurrentUserEnvelopeRead:
        return CurrentUserEnvelopeRead(
            user=self._to_user_read(user),
            permissions=sorted(get_effective_permissions(user)),
        )

    def get_user_permissions(self, user_id: int) -> UserPermissionsRead:
        user = self._get_user(user_id)
        effective_permissions = get_effective_permissions(user)
        return UserPermissionsRead(
            user=self._to_user_read(user),
            permissions=[
                PermissionStateRead(permission_code=permission_code, is_allowed=permission_code in effective_permissions)
                for permission_code in ALL_PERMISSION_CODES
            ],
        )

    def update_user_permissions(
        self,
        user_id: int,
        payload: UserPermissionsUpdateRequest,
        *,
        actor_user_id: int | None,
    ) -> UserPermissionsRead:
        user = self._get_user(user_id)
        if actor_user_id is not None and actor_user_id == user.id:
            raise AppError(code="forbidden", message="Нельзя изменять собственные права", status_code=403)
        if user.role.code == "admin":
            raise AppError(code="forbidden", message="Нельзя изменять права администратора", status_code=403)

        existing_rows = {row.permission_code: row for row in user.permissions}
        desired_states = {item.permission_code: item.is_allowed for item in payload.permissions}

        for permission_code, desired_is_allowed in desired_states.items():
            default_is_allowed = permission_code in DEFAULT_STANDARD_USER_PERMISSION_CODES
            existing_row = existing_rows.get(permission_code)

            if desired_is_allowed == default_is_allowed:
                if existing_row is not None:
                    self.session.delete(existing_row)
                continue

            if existing_row is None:
                self.session.add(
                    CrmUserPermission(
                        user_id=user.id,
                        permission_code=permission_code,
                        is_allowed=desired_is_allowed,
                        updated_by_user_id=actor_user_id,
                    )
                )
                continue

            existing_row.is_allowed = desired_is_allowed
            existing_row.updated_by_user_id = actor_user_id

        self.session.commit()
        self.session.expire(user, ["permissions"])
        return self.get_user_permissions(user.id)
