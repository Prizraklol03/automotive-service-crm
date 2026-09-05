from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field, computed_field

from app.crm.schemas.common import CrmSchema


class ExternalLeadSourcePayload(CrmSchema):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: str | None = Field(default=None, max_length=64)
    name: str | None = Field(default=None, max_length=255)
    page_url: str | None = Field(default=None, alias="pageUrl", max_length=2048)
    source_block: str | None = Field(default=None, alias="sourceBlock", max_length=128)
    form_name: str | None = Field(default=None, alias="formName", max_length=128)


class ExternalLeadCustomerPayload(CrmSchema):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: str | None = Field(default=None, max_length=255)
    phone: str = Field(min_length=1, max_length=64)


class ExternalLeadRequestPayload(CrmSchema):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    message: str | None = Field(default=None, max_length=4000)
    service: str | None = Field(default=None, max_length=255)
    package: str | None = Field(default=None, max_length=255)


class ExternalLeadTrackingPayload(CrmSchema):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    utm_source: str | None = Field(default=None, alias="utmSource", max_length=255)
    utm_medium: str | None = Field(default=None, alias="utmMedium", max_length=255)
    utm_campaign: str | None = Field(default=None, alias="utmCampaign", max_length=255)
    utm_content: str | None = Field(default=None, alias="utmContent", max_length=255)
    utm_term: str | None = Field(default=None, alias="utmTerm", max_length=255)


class ExternalLeadSubmissionCreate(CrmSchema):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: ExternalLeadSourcePayload = Field(default_factory=ExternalLeadSourcePayload)
    customer: ExternalLeadCustomerPayload
    request: ExternalLeadRequestPayload = Field(default_factory=ExternalLeadRequestPayload)
    tracking: ExternalLeadTrackingPayload = Field(default_factory=ExternalLeadTrackingPayload)
    metadata: dict[str, Any] | None = Field(default=None, max_length=32)


class ExternalLeadSubmitResponse(CrmSchema):
    success: bool
    leadId: int
    customerId: int
    orderId: int | None
    status: str


class ExternalLeadErrorResponse(CrmSchema):
    success: bool
    error: str
    message: str | None = None


class ExternalLeadSummaryRead(CrmSchema):
    model_config = ConfigDict(populate_by_name=True)

    new_count: int = Field(serialization_alias="newCount")
    in_work_count: int = Field(serialization_alias="inWorkCount")
    total_open_count: int = Field(serialization_alias="totalOpenCount")


class ExternalLeadListItemRead(CrmSchema):
    id: int
    integration_source_id: int
    client_id: int | None
    created_order_id: int | None
    phone_normalized: str
    customer_name: str | None
    customer_phone_raw: str
    status: str
    dedupe_status: str
    source_type: str | None
    source_name: str | None
    page_url: str | None
    source_block: str | None
    form_name: str | None
    message: str | None
    service_name: str | None
    package_name: str | None
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    utm_content: str | None
    utm_term: str | None
    duplicate_count: int
    last_duplicate_at: datetime | None
    created_at: datetime
    updated_at: datetime
    client_display_name: str | None = None
    integration_source_name: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def display_name(self) -> str:
        return self.customer_name or self.client_display_name or "Клиент без имени"


class ExternalLeadDetailRead(ExternalLeadListItemRead):
    raw_payload: dict[str, Any] | None = None


class ExternalLeadStatusUpdate(CrmSchema):
    status: str = Field(min_length=1, max_length=32)
