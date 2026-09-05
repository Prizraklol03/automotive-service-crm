from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crm.api.deps import CurrentUserContext, require_permission
from app.crm.schemas.auth import AuthSessionRead
from app.crm.schemas.permissions import UserPermissionsRead, UserPermissionsUpdateRequest
from app.crm.schemas.user import UserActivityFeedRead, UserCreate, UserPasswordReset, UserRead, UserStatusUpdate, UserUpdate
from app.crm.services.auth_service import AuthService
from app.crm.services.permission_service import UserPermissionService
from app.crm.services.user_service import UserService

router = APIRouter()


def _to_user_read(user) -> UserRead:
    return UserRead(
        id=user.id,
        role_id=user.role_id,
        role_code=user.role.code,
        full_name=user.full_name,
        login=user.login,
        token_version=user.token_version,
        is_active=user.is_active,
    )


@router.get("", response_model=list[UserRead])
def list_users(
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> list[UserRead]:
    return [_to_user_read(user) for user in UserService(db).list_all(is_active=is_active)]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserRead:
    return _to_user_read(UserService(db).create_user(payload, actor_user_id=current_user.user.id))


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserRead:
    return _to_user_read(UserService(db).get(user_id))


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserRead:
    return _to_user_read(UserService(db).update(user_id, payload, actor_user_id=current_user.user.id))


@router.patch("/{user_id}/active", response_model=UserRead)
def set_user_active(
    user_id: int,
    payload: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserRead:
    return _to_user_read(UserService(db).set_active(user_id, payload.is_active, actor_user_id=current_user.user.id))


@router.patch("/{user_id}/reset-password", response_model=UserRead)
def reset_user_password(
    user_id: int,
    payload: UserPasswordReset,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserRead:
    return _to_user_read(UserService(db).reset_password(user_id, payload.new_password, actor_user_id=current_user.user.id))


@router.patch("/{user_id}/revoke-sessions", response_model=UserRead)
def revoke_user_sessions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserRead:
    return _to_user_read(UserService(db).revoke_sessions(user_id, actor_user_id=current_user.user.id))


@router.get("/{user_id}/sessions", response_model=list[AuthSessionRead])
def list_user_sessions(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> list[AuthSessionRead]:
    UserService(db).get(user_id)
    sessions = AuthService(db).list_sessions(user_id=user_id)
    return [
        AuthSessionRead(
            id=session_row.id,
            device_type=session_row.device_type,
            device_name=session_row.device_name,
            created_at=session_row.created_at,
            last_used_at=session_row.last_used_at,
            expires_at=session_row.expires_at,
            absolute_expires_at=session_row.absolute_expires_at,
            is_current=False,
        )
        for session_row in sessions
    ]


@router.get("/{user_id}/activity", response_model=UserActivityFeedRead)
def get_user_activity(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserActivityFeedRead:
    return UserService(db).list_activity(user_id)


@router.get("/{user_id}/permissions", response_model=UserPermissionsRead)
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserPermissionsRead:
    return UserPermissionService(db).get_user_permissions(user_id)


@router.patch("/{user_id}/permissions", response_model=UserPermissionsRead)
def update_user_permissions(
    user_id: int,
    payload: UserPermissionsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUserContext = Depends(require_permission("settings.users.manage")),
) -> UserPermissionsRead:
    return UserPermissionService(db).update_user_permissions(
        user_id,
        payload,
        actor_user_id=current_user.user.id,
    )
