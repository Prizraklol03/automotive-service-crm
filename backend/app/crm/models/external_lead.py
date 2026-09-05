from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.crm.models.client import CrmClient
    from app.crm.models.order import CrmOrder


class CrmIntegrationSource(TimestampMixin, Base):
    __tablename__ = "crm_integration_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False, default="website")
    api_key_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allowed_domains: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    lead_submissions: Mapped[list["CrmExternalLeadSubmission"]] = relationship(
        "CrmExternalLeadSubmission",
        back_populates="integration_source",
    )
    payload_logs: Mapped[list["CrmExternalLeadPayloadLog"]] = relationship(
        "CrmExternalLeadPayloadLog",
        back_populates="integration_source",
    )


class CrmExternalLeadSubmission(TimestampMixin, Base):
    __tablename__ = "crm_external_lead_submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    integration_source_id: Mapped[int] = mapped_column(
        ForeignKey("crm_integration_sources.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[int | None] = mapped_column(ForeignKey("crm_clients.id", ondelete="RESTRICT"), nullable=True, index=True)
    phone_normalized: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone_raw: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new")
    dedupe_status: Mapped[str] = mapped_column(String(32), nullable=False, default="unique")
    source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_block: Mapped[str | None] = mapped_column(String(128), nullable=True)
    form_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    service_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    package_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_term: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_order_id: Mapped[int | None] = mapped_column(ForeignKey("crm_orders.id", ondelete="RESTRICT"), nullable=True, index=True)
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_duplicate_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    integration_source: Mapped["CrmIntegrationSource"] = relationship("CrmIntegrationSource", back_populates="lead_submissions")
    client: Mapped["CrmClient | None"] = relationship("CrmClient")
    created_order: Mapped["CrmOrder | None"] = relationship("CrmOrder")
    payload_logs: Mapped[list["CrmExternalLeadPayloadLog"]] = relationship(
        "CrmExternalLeadPayloadLog",
        back_populates="external_lead",
    )


class CrmExternalLeadPayloadLog(TimestampMixin, Base):
    __tablename__ = "crm_external_lead_payload_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    integration_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_integration_sources.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    external_lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("crm_external_lead_submissions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    integration_source: Mapped["CrmIntegrationSource | None"] = relationship("CrmIntegrationSource", back_populates="payload_logs")
    external_lead: Mapped["CrmExternalLeadSubmission | None"] = relationship("CrmExternalLeadSubmission", back_populates="payload_logs")
