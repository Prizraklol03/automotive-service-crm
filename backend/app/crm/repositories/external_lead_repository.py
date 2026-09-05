from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.crm.models.external_lead import CrmExternalLeadPayloadLog, CrmExternalLeadSubmission


class ExternalLeadRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def _base_query() -> Select[tuple[CrmExternalLeadSubmission]]:
        return select(CrmExternalLeadSubmission).options(
            selectinload(CrmExternalLeadSubmission.client),
            selectinload(CrmExternalLeadSubmission.integration_source),
        )

    def create(self, lead: CrmExternalLeadSubmission) -> CrmExternalLeadSubmission:
        self.session.add(lead)
        self.session.flush()
        return lead

    def find_recent_duplicate(
        self,
        *,
        integration_source_id: int,
        phone_normalized: str,
        form_name: str | None,
        page_url: str | None,
        created_after: datetime,
    ) -> CrmExternalLeadSubmission | None:
        statement = (
            select(CrmExternalLeadSubmission)
            .where(
                CrmExternalLeadSubmission.integration_source_id == integration_source_id,
                CrmExternalLeadSubmission.phone_normalized == phone_normalized,
                CrmExternalLeadSubmission.form_name == form_name,
                CrmExternalLeadSubmission.page_url == page_url,
                CrmExternalLeadSubmission.created_at >= created_after,
            )
            .order_by(CrmExternalLeadSubmission.created_at.desc(), CrmExternalLeadSubmission.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def get_by_id(self, lead_id: int) -> CrmExternalLeadSubmission | None:
        statement = self._base_query().where(CrmExternalLeadSubmission.id == lead_id)
        return self.session.scalar(statement)

    def list(
        self,
        *,
        status: str | None,
        search: str | None,
    ) -> list[CrmExternalLeadSubmission]:
        statement = self._base_query()
        if status:
            statement = statement.where(CrmExternalLeadSubmission.status == status)
        if search:
            normalized = f"%{search.strip()}%"
            statement = statement.where(
                or_(
                    CrmExternalLeadSubmission.customer_name.ilike(normalized),
                    CrmExternalLeadSubmission.customer_phone_raw.ilike(normalized),
                    CrmExternalLeadSubmission.phone_normalized.ilike(normalized),
                    CrmExternalLeadSubmission.source_name.ilike(normalized),
                    CrmExternalLeadSubmission.form_name.ilike(normalized),
                    CrmExternalLeadSubmission.page_url.ilike(normalized),
                    CrmExternalLeadSubmission.message.ilike(normalized),
                    CrmExternalLeadSubmission.service_name.ilike(normalized),
                    CrmExternalLeadSubmission.package_name.ilike(normalized),
                )
            )
        statement = statement.order_by(CrmExternalLeadSubmission.created_at.desc(), CrmExternalLeadSubmission.id.desc())
        return list(self.session.scalars(statement))

    def count_by_status(self, status: str) -> int:
        return int(
            self.session.scalar(
                select(func.count()).select_from(CrmExternalLeadSubmission).where(CrmExternalLeadSubmission.status == status)
            )
            or 0
        )


class ExternalLeadPayloadLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, payload_log: CrmExternalLeadPayloadLog) -> CrmExternalLeadPayloadLog:
        self.session.add(payload_log)
        self.session.flush()
        return payload_log
