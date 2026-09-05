from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.privacy import hash_name_lookup_tokens, hash_phone_lookup
from app.core.logging import get_logger
from app.core.security import hash_password, verify_password
from app.core.time import app_now_naive
from app.crm.models.audit_log import CrmAuditLog
from app.crm.models.client import CrmClient
from app.crm.models.external_lead import CrmExternalLeadPayloadLog, CrmExternalLeadSubmission, CrmIntegrationSource
from app.crm.repositories.audit_log_repository import AuditLogRepository
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.external_lead_repository import ExternalLeadPayloadLogRepository, ExternalLeadRepository
from app.crm.repositories.integration_source_repository import IntegrationSourceRepository
from app.crm.schemas.external_lead import (
    ExternalLeadDetailRead,
    ExternalLeadListItemRead,
    ExternalLeadSubmissionCreate,
    ExternalLeadSummaryRead,
)
from app.crm.utils.normalization import normalize_phone

logger = get_logger(__name__)

CUSTOMER_NAME_FALLBACK = "Клиент из внешней заявки"
EXTERNAL_LEAD_OPEN_STATUSES = {"new", "in_work"}
EXTERNAL_LEAD_ALLOWED_STATUSES = EXTERNAL_LEAD_OPEN_STATUSES | {"closed", "spam"}
PAYLOAD_REDACT_KEYS = {
    "api_key",
    "apikey",
    "authorization",
    "password",
    "secret",
    "token",
    "x_integration_key",
    "x-integration-key",
    "xintegrationkey",
}


@dataclass
class ExternalLeadSubmitResult:
    lead: CrmExternalLeadSubmission
    client: CrmClient
    status: str


class ExternalLeadService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.clients = ClientRepository(session)
        self.integration_sources = IntegrationSourceRepository(session)
        self.leads = ExternalLeadRepository(session)
        self.payload_logs = ExternalLeadPayloadLogRepository(session)
        self.audit_logs = AuditLogRepository(session)

    @staticmethod
    def generate_api_key() -> str:
        import secrets

        return f"els_{secrets.token_urlsafe(24)}"

    @staticmethod
    def hash_api_key(api_key: str) -> str:
        return hash_password(api_key)

    @staticmethod
    def _sanitize_text(value: str | None) -> str | None:
        text = value.strip() if value else ""
        return text or None

    @classmethod
    def sanitize_payload(cls, payload: Any) -> Any:
        if isinstance(payload, dict):
            sanitized: dict[str, Any] = {}
            for key, value in payload.items():
                normalized_key = str(key).strip().lower()
                if normalized_key in PAYLOAD_REDACT_KEYS:
                    sanitized[str(key)] = "[REDACTED]"
                    continue
                sanitized[str(key)] = cls.sanitize_payload(value)
            return sanitized
        if isinstance(payload, list):
            return [cls.sanitize_payload(item) for item in payload]
        return payload

    @staticmethod
    def _extract_host(raw_value: str | None) -> str | None:
        if not raw_value:
            return None
        candidate = raw_value.strip()
        if not candidate:
            return None
        parsed = urlparse(candidate)
        host = parsed.hostname
        return host.lower() if host else None

    @staticmethod
    def _domain_matches(host: str, allowed_domain: str) -> bool:
        normalized_domain = allowed_domain.strip().lower()
        if not normalized_domain:
            return False
        return host == normalized_domain or host.endswith(f".{normalized_domain}")

    def _find_active_source_by_api_key(self, api_key: str) -> CrmIntegrationSource | None:
        for source in self.integration_sources.list_active():
            if verify_password(api_key, source.api_key_hash):
                return source
        return None

    def authenticate_source(self, integration_key: str | None) -> CrmIntegrationSource:
        api_key = (integration_key or "").strip()
        if not api_key or len(api_key) > 256:
            raise AppError(code="auth_failed", message="Unauthorized", status_code=401)
        source = self._find_active_source_by_api_key(api_key)
        if source is None:
            raise AppError(code="auth_failed", message="Unauthorized", status_code=401)
        return source

    def _validate_allowed_domains(
        self,
        source: CrmIntegrationSource,
        *,
        page_url: str | None,
        origin: str | None,
        referer: str | None,
    ) -> None:
        allowed_domains = [domain for domain in (source.allowed_domains or []) if isinstance(domain, str) and domain.strip()]
        if not allowed_domains:
            return

        hosts = [
            host
            for host in (
                self._extract_host(page_url),
                self._extract_host(origin),
                self._extract_host(referer),
            )
            if host
        ]
        if not hosts:
            return

        for host in hosts:
            if any(self._domain_matches(host, allowed_domain) for allowed_domain in allowed_domains):
                return

        raise AppError(code="auth_failed", message="Unauthorized", status_code=401)

    def _record_payload_log(
        self,
        *,
        integration_source: CrmIntegrationSource | None,
        external_lead: CrmExternalLeadSubmission | None,
        status: str,
        error: str | None,
        raw_payload: dict[str, Any] | None,
    ) -> None:
        self.payload_logs.create(
            CrmExternalLeadPayloadLog(
                integration_source_id=integration_source.id if integration_source else None,
                external_lead_id=external_lead.id if external_lead else None,
                status=status,
                error=error,
                raw_payload=raw_payload,
            )
        )

    def _get_or_create_client(self, *, customer_name: str | None, normalized_phone: str) -> CrmClient:
        existing_client = self.clients.get_by_normalized_phone(normalized_phone, include_deleted=False)
        if existing_client:
            return existing_client

        client = CrmClient(
            full_name=self._sanitize_text(customer_name) or CUSTOMER_NAME_FALLBACK,
            client_type="individual",
            phone_display=normalized_phone,
            phone_normalized=normalized_phone,
            phone_search_hash=hash_phone_lookup(normalized_phone),
            name_search_hashes=hash_name_lookup_tokens(customer_name or CUSTOMER_NAME_FALLBACK),
        )
        self.clients.create(client)
        return client

    @staticmethod
    def _normalize_status(status: str | None) -> str | None:
        if status is None:
            return None
        normalized = status.strip().lower()
        if not normalized:
            return None
        if normalized not in EXTERNAL_LEAD_ALLOWED_STATUSES:
            raise AppError(code="validation_error", message="Некорректный статус заявки", status_code=422)
        return normalized

    @staticmethod
    def _normalize_search(search: str | None) -> str | None:
        normalized = (search or "").strip()
        return normalized or None

    @staticmethod
    def _to_list_item(lead: CrmExternalLeadSubmission) -> ExternalLeadListItemRead:
        return ExternalLeadListItemRead(
            id=lead.id,
            integration_source_id=lead.integration_source_id,
            client_id=lead.client_id,
            created_order_id=lead.created_order_id,
            phone_normalized=lead.phone_normalized,
            customer_name=lead.customer_name,
            customer_phone_raw=lead.customer_phone_raw,
            status=lead.status,
            dedupe_status=lead.dedupe_status,
            source_type=lead.source_type,
            source_name=lead.source_name,
            page_url=lead.page_url,
            source_block=lead.source_block,
            form_name=lead.form_name,
            message=lead.message,
            service_name=lead.service_name,
            package_name=lead.package_name,
            utm_source=lead.utm_source,
            utm_medium=lead.utm_medium,
            utm_campaign=lead.utm_campaign,
            utm_content=lead.utm_content,
            utm_term=lead.utm_term,
            duplicate_count=lead.duplicate_count,
            last_duplicate_at=lead.last_duplicate_at,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
            client_display_name=lead.client.display_label if lead.client else None,
            integration_source_name=lead.integration_source.name if lead.integration_source else None,
        )

    def get_summary(self) -> ExternalLeadSummaryRead:
        new_count = self.leads.count_by_status("new")
        in_work_count = self.leads.count_by_status("in_work")
        return ExternalLeadSummaryRead(
            new_count=new_count,
            in_work_count=in_work_count,
            total_open_count=new_count + in_work_count,
        )

    def list_for_crm(self, *, status: str | None, search: str | None) -> list[ExternalLeadListItemRead]:
        normalized_status = self._normalize_status(status)
        normalized_search = self._normalize_search(search)
        leads = self.leads.list(status=normalized_status, search=normalized_search)
        return [self._to_list_item(lead) for lead in leads]

    def get_for_crm(self, lead_id: int) -> ExternalLeadDetailRead:
        lead = self.leads.get_by_id(lead_id)
        if lead is None:
            raise AppError(code="not_found", message="Заявка не найдена", status_code=404)
        return ExternalLeadDetailRead(**self._to_list_item(lead).model_dump(), raw_payload=lead.raw_payload)

    def update_status(self, lead_id: int, *, status: str, actor_user_id: int) -> ExternalLeadDetailRead:
        lead = self.leads.get_by_id(lead_id)
        if lead is None:
            raise AppError(code="not_found", message="Заявка не найдена", status_code=404)

        normalized_status = self._normalize_status(status)
        assert normalized_status is not None
        if lead.status == normalized_status:
            return self.get_for_crm(lead_id)

        lead.status = normalized_status
        lead.updated_at = app_now_naive()
        self.audit_logs.create(
            CrmAuditLog(
                actor_user_id=actor_user_id,
                entity_type="external_lead_submission",
                entity_id=lead.id,
                action="status_update",
                title="Обновлен статус внешней заявки",
                description=normalized_status,
            )
        )
        self.session.commit()
        return self.get_for_crm(lead.id)

    def submit(
        self,
        *,
        integration_key: str | None,
        raw_payload: Any,
        origin: str | None,
        referer: str | None,
    ) -> ExternalLeadSubmitResult:
        integration_source = self.authenticate_source(integration_key)
        return self.submit_authenticated(
            integration_source=integration_source,
            raw_payload=raw_payload,
            origin=origin,
            referer=referer,
        )

    def submit_authenticated(
        self,
        *,
        integration_source: CrmIntegrationSource,
        raw_payload: Any,
        origin: str | None,
        referer: str | None,
    ) -> ExternalLeadSubmitResult:

        if not isinstance(raw_payload, dict):
            self._record_payload_log(
                integration_source=integration_source,
                external_lead=None,
                status="validation_error",
                error="invalid_payload_shape",
                raw_payload=None,
            )
            self.session.commit()
            raise AppError(code="validation_error", message="Invalid payload", status_code=422)

        try:
            payload = ExternalLeadSubmissionCreate.model_validate(raw_payload)
        except ValidationError as exc:
            self._record_payload_log(
                integration_source=integration_source,
                external_lead=None,
                status="validation_error",
                error="payload_validation_failed",
                raw_payload=None,
            )
            self.session.commit()
            raise AppError(code="validation_error", message="Invalid payload", status_code=422) from exc

        try:
            self._validate_allowed_domains(
                integration_source,
                page_url=payload.source.page_url,
                origin=origin,
                referer=referer,
            )
        except AppError:
            self._record_payload_log(
                integration_source=integration_source,
                external_lead=None,
                status="unauthorized",
                error="domain_not_allowed",
                raw_payload=None,
            )
            self.session.commit()
            raise

        try:
            normalized_phone = normalize_phone(payload.customer.phone)
        except AppError as exc:
            self._record_payload_log(
                integration_source=integration_source,
                external_lead=None,
                status="validation_error",
                error="invalid_phone",
                raw_payload=None,
            )
            self.session.commit()
            raise AppError(code="validation_error", message="Invalid phone", status_code=422) from exc

        now = app_now_naive()
        integration_source.last_used_at = now
        dedupe_window_hours = get_settings().external_leads_duplicate_window_hours
        duplicate = self.leads.find_recent_duplicate(
            integration_source_id=integration_source.id,
            phone_normalized=normalized_phone,
            form_name=self._sanitize_text(payload.source.form_name),
            page_url=self._sanitize_text(payload.source.page_url),
            created_after=now - timedelta(hours=dedupe_window_hours),
        )

        client = self._get_or_create_client(
            customer_name=payload.customer.name,
            normalized_phone=normalized_phone,
        )

        if duplicate is not None:
            duplicate.dedupe_status = "duplicate"
            duplicate.duplicate_count += 1
            duplicate.last_duplicate_at = now
            if duplicate.client_id is None:
                duplicate.client_id = client.id
            self._record_payload_log(
                integration_source=integration_source,
                external_lead=duplicate,
                status="duplicate",
                error=None,
                raw_payload=None,
            )
            self.session.commit()
            return ExternalLeadSubmitResult(lead=duplicate, client=client, status="duplicate")

        lead = CrmExternalLeadSubmission(
            integration_source_id=integration_source.id,
            client_id=client.id,
            phone_normalized=normalized_phone,
            customer_name=self._sanitize_text(payload.customer.name),
            customer_phone_raw=payload.customer.phone.strip(),
            status="new",
            dedupe_status="unique",
            source_type=self._sanitize_text(payload.source.type) or integration_source.type,
            source_name=self._sanitize_text(payload.source.name) or integration_source.name,
            page_url=self._sanitize_text(payload.source.page_url),
            source_block=self._sanitize_text(payload.source.source_block),
            form_name=self._sanitize_text(payload.source.form_name),
            message=self._sanitize_text(payload.request.message),
            service_name=self._sanitize_text(payload.request.service),
            package_name=self._sanitize_text(payload.request.package),
            utm_source=self._sanitize_text(payload.tracking.utm_source),
            utm_medium=self._sanitize_text(payload.tracking.utm_medium),
            utm_campaign=self._sanitize_text(payload.tracking.utm_campaign),
            utm_content=self._sanitize_text(payload.tracking.utm_content),
            utm_term=self._sanitize_text(payload.tracking.utm_term),
            raw_payload=None,
        )

        try:
            self.leads.create(lead)
            self._record_payload_log(
                integration_source=integration_source,
                external_lead=lead,
                status="created",
                error=None,
                raw_payload=None,
            )
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            logger.exception("External lead creation failed for integration source %s", integration_source.id)
            raise AppError(code="conflict", message="External lead submission failed", status_code=409) from exc

        return ExternalLeadSubmitResult(lead=lead, client=client, status="created")
