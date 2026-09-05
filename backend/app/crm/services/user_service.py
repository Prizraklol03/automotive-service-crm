from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import hash_password, validate_new_password
from app.crm.models.role import CrmRole
from app.crm.models.user import CrmUser
from app.crm.repositories.role_repository import RoleRepository
from app.crm.repositories.user_repository import UserRepository
from app.crm.schemas.user import RoleCreate, UserActivityFeedRead, UserCreate, UserUpdate
from app.crm.services.audit_log_service import AuditLogService
from app.crm.services.auth_service import AuthService


class UserService:
    DEFAULT_ROLES: tuple[tuple[str, str], ...] = (("admin", "Admin"), ("standard_user", "Standard User"))

    def __init__(self, session: Session) -> None:
        self.session = session
        self.roles = RoleRepository(session)
        self.users = UserRepository(session)
        self.audit_logs = AuditLogService(session)

    def ensure_default_roles(self) -> list[CrmRole]:
        ensured: list[CrmRole] = []
        changed = False
        for code, name in self.DEFAULT_ROLES:
            role = self.roles.get_by_code(code)
            if role is None:
                role = CrmRole(code=code, name=name)
                self.roles.create(role)
                changed = True
            ensured.append(role)
        if changed:
            self.session.commit()
        return ensured

    def ensure_bootstrap_admin(self, *, login: str | None, password: str | None, full_name: str) -> CrmUser | None:
        if not login or not password:
            return None
        if self.users.has_any():
            return None
        return self.create_user(
            UserCreate(
                role_code="admin",
                full_name=full_name,
                login=login,
                password=password,
                is_active=True,
            )
        )

    def create_role(self, payload: RoleCreate) -> CrmRole:
        role = CrmRole(code=payload.code.strip(), name=payload.name.strip())
        try:
            self.roles.create(role)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Роль уже существует", status_code=409) from exc
        return role

    def _resolve_role(self, *, role_id: int | None, role_code: str | None) -> CrmRole:
        role = None
        if role_id is not None:
            role = self.roles.get_by_id(role_id)
        elif role_code is not None:
            role = self.roles.get_by_code(role_code.strip())
        if not role:
            raise AppError(code="not_found", message="Роль не найдена", status_code=404)
        return role

    def create_user(self, payload: UserCreate, *, actor_user_id: int | None = None) -> CrmUser:
        validate_new_password(payload.password)
        role = self._resolve_role(role_id=payload.role_id, role_code=payload.role_code)
        user = CrmUser(
            role_id=role.id,
            full_name=payload.full_name.strip(),
            login=payload.login.strip(),
            password_hash=hash_password(payload.password),
            token_version=1,
            is_active=payload.is_active,
        )
        try:
            self.users.create(user)
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="user",
                entity_id=user.id,
                action="create",
                title=f"Создан сотрудник {user.full_name}",
                description=f"Логин: {user.login}",
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Сотрудник с таким логином уже существует", status_code=409) from exc
        self.session.refresh(user)
        return self.get(user.id)

    def list_all(self, *, is_active: bool | None = None) -> list[CrmUser]:
        return self.users.list_all(is_active=is_active)

    def get(self, user_id: int) -> CrmUser:
        user = self.users.get_by_id(user_id)
        if not user:
            raise AppError(code="not_found", message="Сотрудник не найден", status_code=404)
        return user

    def update(self, user_id: int, payload: UserUpdate, *, actor_user_id: int | None = None) -> CrmUser:
        user = self.get(user_id)
        if user.is_active != payload.is_active:
            self.set_active(user_id, payload.is_active, actor_user_id=actor_user_id)
            user = self.get(user_id)
        role = self._resolve_role(role_id=payload.role_id, role_code=payload.role_code)
        user.role_id = role.id
        user.full_name = payload.full_name.strip()
        user.login = payload.login.strip()
        user.is_active = payload.is_active
        try:
            self.audit_logs.record(
                actor_user_id=actor_user_id,
                entity_type="user",
                entity_id=user.id,
                action="update",
                title=f"Обновлён сотрудник {user.full_name}",
                description=f"Логин: {user.login}",
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise AppError(code="conflict", message="Сотрудник с таким логином уже существует", status_code=409) from exc
        self.session.refresh(user)
        return self.get(user_id)

    def set_active(self, user_id: int, is_active: bool, *, actor_user_id: int | None = None) -> CrmUser:
        user = self.get(user_id)
        if user.is_active == is_active:
            return user

        if not is_active:
            if actor_user_id == user.id:
                raise AppError(code="forbidden", message="Нельзя архивировать собственную учётную запись", status_code=403)
            if user.role.code == "admin" and len(self.users.list_active_admins_for_update()) <= 1:
                raise AppError(code="conflict", message="Нельзя архивировать последнего активного администратора", status_code=409)

        user.is_active = is_active
        if not is_active:
            AuthService(self.session).revoke_all_for_user(
                user=user,
                actor_user_id=actor_user_id,
                increment_token_version=True,
                commit=False,
            )
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="user",
            entity_id=user.id,
            action="restore" if is_active else "archive",
            title=f"{'Восстановлен' if is_active else 'Архивирован'} пользователь {user.full_name}",
            description=f"Логин: {user.login}",
        )
        self.session.commit()
        return self.get(user_id)

    def reset_password(self, user_id: int, new_password: str, *, actor_user_id: int | None = None) -> CrmUser:
        validate_new_password(new_password)
        user = self.get(user_id)
        user.password_hash = hash_password(new_password)
        AuthService(self.session).revoke_all_for_password_reset(user=user, actor_user_id=actor_user_id)
        self.audit_logs.record(
            actor_user_id=actor_user_id,
            entity_type="user",
            entity_id=user.id,
            action="reset_password",
            title=f"Сброшен пароль сотрудника {user.full_name}",
            description=f"Логин: {user.login}",
        )
        self.session.commit()
        return self.get(user_id)

    def revoke_sessions(self, user_id: int, *, actor_user_id: int | None = None) -> CrmUser:
        user = self.get(user_id)
        AuthService(self.session).revoke_all_for_user(user=user, actor_user_id=actor_user_id, increment_token_version=True)
        return self.get(user_id)

    def list_activity(self, user_id: int) -> UserActivityFeedRead:
        user = self.get(user_id)
        return UserActivityFeedRead(user_id=user.id, activities=self.audit_logs.list_by_actor(user.id))
