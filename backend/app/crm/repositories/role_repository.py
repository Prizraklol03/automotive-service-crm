from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.role import CrmRole


class RoleRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, role: CrmRole) -> CrmRole:
        self.session.add(role)
        self.session.flush()
        return role

    def get_by_code(self, code: str) -> CrmRole | None:
        return self.session.scalar(select(CrmRole).where(CrmRole.code == code))

    def get_by_id(self, role_id: int) -> CrmRole | None:
        return self.session.get(CrmRole, role_id)
