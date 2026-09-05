from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crm.models.setting import CrmSetting


class SettingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, setting: CrmSetting) -> CrmSetting:
        self.session.add(setting)
        self.session.flush()
        return setting

    def get_by_key(self, key: str) -> CrmSetting | None:
        return self.session.scalar(select(CrmSetting).where(CrmSetting.key == key))

    def list_all(self) -> list[CrmSetting]:
        return list(self.session.scalars(select(CrmSetting).order_by(CrmSetting.key.asc())))
