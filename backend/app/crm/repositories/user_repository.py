from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.role import CrmRole
from app.crm.models.user import CrmUser


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, user: CrmUser) -> CrmUser:
        self.session.add(user)
        self.session.flush()
        return user

    def get_by_login(self, login: str) -> CrmUser | None:
        statement = select(CrmUser).options(selectinload(CrmUser.role), selectinload(CrmUser.permissions)).where(CrmUser.login == login)
        return self.session.scalar(statement)

    def get_by_id(self, user_id: int) -> CrmUser | None:
        statement = select(CrmUser).options(selectinload(CrmUser.role), selectinload(CrmUser.permissions)).where(CrmUser.id == user_id)
        return self.session.scalar(statement)

    def has_any(self) -> bool:
        statement = select(exists().where(CrmUser.id.is_not(None)))
        return bool(self.session.scalar(statement))

    def list_all(self, *, is_active: bool | None = None) -> list[CrmUser]:
        statement = select(CrmUser).options(selectinload(CrmUser.role), selectinload(CrmUser.permissions))
        if is_active is not None:
            statement = statement.where(CrmUser.is_active.is_(is_active))
        statement = statement.order_by(CrmUser.full_name.asc(), CrmUser.id.asc())
        return list(self.session.scalars(statement))

    def list_active_admins_for_update(self) -> list[CrmUser]:
        statement = (
            select(CrmUser)
            .join(CrmUser.role)
            .where(CrmUser.is_active.is_(True), CrmRole.code == "admin")
            .with_for_update()
        )
        return list(self.session.scalars(statement))
