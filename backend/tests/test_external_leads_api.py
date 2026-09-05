from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.core.security import verify_password  # noqa: E402
from app.crm.models.audit_log import CrmAuditLog  # noqa: E402
from app.crm.models.client import CrmClient  # noqa: E402
from app.crm.models.external_lead import CrmExternalLeadPayloadLog, CrmExternalLeadSubmission, CrmIntegrationSource  # noqa: E402
from app.crm.api.routers.integrations import reset_external_lead_rate_limiter  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.services.external_lead_service import ExternalLeadService  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class ExternalLeadsApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        reset_external_lead_rate_limiter()
        self.db_harness = create_schema_harness(metadata=Base.metadata)
        self.engine = self.db_harness.engine
        self.SessionLocal = self.db_harness.SessionLocal

        self.app = FastAPI()
        register_exception_handlers(self.app)
        self.app.include_router(api_router, prefix="/api")

        def override_get_db():
            session: Session = self.SessionLocal()
            try:
                yield session
            finally:
                session.close()

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)
        session = self.SessionLocal()
        try:
            user_service = UserService(session)
            roles = {role.code: role for role in user_service.ensure_default_roles()}
            admin_user = user_service.create_user(
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="Admin test passphrase 2026!")
            )
            employee_user = user_service.create_user(
                UserCreate(role_id=roles["standard_user"].id, full_name="Demo Customer 02", login="employee", password="Employee test passphrase 2026!")
            )
            session.commit()
            self.admin_user_id = admin_user.id
            self.employee_user_id = employee_user.id
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()
        reset_external_lead_rate_limiter()

    def create_integration_source(
        self,
        *,
        name: str = "Landing",
        source_type: str = "website",
        allowed_domains: list[str] | None = None,
        is_active: bool = True,
    ) -> tuple[int, str]:
        api_key = ExternalLeadService.generate_api_key()
        session = self.SessionLocal()
        try:
            source = CrmIntegrationSource(
                name=name,
                type=source_type,
                api_key_hash=ExternalLeadService.hash_api_key(api_key),
                is_active=is_active,
                allowed_domains=allowed_domains,
            )
            session.add(source)
            session.commit()
            return source.id, api_key
        finally:
            session.close()

    def auth_headers(self, login: str = "employee", password: str = "Employee test passphrase 2026!") -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def update_employee_permissions(self, permissions: list[dict[str, object]]) -> None:
        response = self.client.patch(
            f"/api/users/{self.employee_user_id}/permissions",
            json={"permissions": permissions},
            headers=self.auth_headers("admin", "Admin test passphrase 2026!"),
        )
        self.assertEqual(response.status_code, 200, response.text)

    def make_payload(self, phone: str = "+70000000001") -> dict:
        return {
            "source": {
                "type": "website",
                "name": "Demo Service Website",
                "pageUrl": "https://leads.example.invalid/",
                "sourceBlock": "hero",
                "formName": "hero_callback",
            },
            "customer": {
                "name": "Иван",
                "phone": phone,
            },
            "request": {
                "message": "Выбран комплекс: Под продажу",
                "service": "Полировка",
                "package": "Под продажу",
            },
            "tracking": {
                "utmSource": "yandex",
                "utmMedium": "cpc",
                "utmCampaign": "detailing",
                "utmContent": "banner_1",
                "utmTerm": "полировка авто",
            },
            "metadata": {
                "rawLandingPayload": {"leadType": "callback"},
            },
        }

    def test_successful_external_lead_creation(self) -> None:
        _, api_key = self.create_integration_source()
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["success"], True)
        self.assertEqual(response.json()["status"], "created")

        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmClient)), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadSubmission)), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadPayloadLog)), 1)
        finally:
            session.close()

    def test_invalid_phone_does_not_create_client_or_lead(self) -> None:
        _, api_key = self.create_integration_source()
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(phone="123"),
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json(), {"success": False, "error": "validation_error", "message": "Invalid phone"})

        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmClient)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadSubmission)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadPayloadLog)), 1)
        finally:
            session.close()

    def test_unauthorized_request(self) -> None:
        response = self.client.post("/api/integrations/external-leads", json=self.make_payload())
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(response.json(), {"success": False, "error": "unauthorized"})

    def test_inactive_integration_source_is_rejected(self) -> None:
        _, api_key = self.create_integration_source(is_active=False)
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(response.json(), {"success": False, "error": "unauthorized"})

    def test_existing_customer_by_phone_is_reused(self) -> None:
        _, api_key = self.create_integration_source()
        session = self.SessionLocal()
        try:
            session.add(
                CrmClient(
                    full_name="Старый клиент",
                    client_type="individual",
                    phone_display="+70000000001",
                    phone_normalized="+70000000001",
                )
            )
            session.commit()
            client_id = session.scalar(select(CrmClient.id))
        finally:
            session.close()

        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["customerId"], client_id)

        session = self.SessionLocal()
        try:
            lead = session.scalar(select(CrmExternalLeadSubmission))
            self.assertIsNotNone(lead)
            self.assertEqual(lead.client_id, client_id)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmClient)), 1)
        finally:
            session.close()

    def test_utm_and_source_fields_are_saved(self) -> None:
        _, api_key = self.create_integration_source()
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 201, response.text)

        session = self.SessionLocal()
        try:
            lead = session.scalar(select(CrmExternalLeadSubmission))
            self.assertIsNotNone(lead)
            self.assertEqual(lead.utm_source, "yandex")
            self.assertEqual(lead.utm_medium, "cpc")
            self.assertEqual(lead.source_name, "Demo Service Website")
            self.assertEqual(lead.form_name, "hero_callback")
            self.assertEqual(lead.page_url, "https://leads.example.invalid/")
            self.assertEqual(lead.source_block, "hero")
            self.assertEqual(lead.message, "Выбран комплекс: Под продажу")
            self.assertEqual(lead.service_name, "Полировка")
            self.assertEqual(lead.package_name, "Под продажу")
        finally:
            session.close()

    def test_duplicate_request_returns_duplicate_and_does_not_create_second_lead(self) -> None:
        _, api_key = self.create_integration_source()
        first = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        second = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json()["status"], "duplicate")
        self.assertEqual(second.json()["leadId"], first.json()["leadId"])

        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadSubmission)), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadPayloadLog)), 2)
            lead = session.scalar(select(CrmExternalLeadSubmission))
            self.assertEqual(lead.dedupe_status, "duplicate")
            self.assertEqual(lead.duplicate_count, 1)
            self.assertIsNotNone(lead.last_duplicate_at)
            payload_logs = list(session.scalars(select(CrmExternalLeadPayloadLog).order_by(CrmExternalLeadPayloadLog.id.asc())))
            self.assertEqual(payload_logs[-1].status, "duplicate")
        finally:
            session.close()

    def test_api_key_is_not_stored_plaintext(self) -> None:
        source_id, api_key = self.create_integration_source()
        session = self.SessionLocal()
        try:
            source = session.get(CrmIntegrationSource, source_id)
            self.assertIsNotNone(source)
            self.assertNotEqual(source.api_key_hash, api_key)
            self.assertTrue(verify_password(api_key, source.api_key_hash))
        finally:
            session.close()

    def test_api_key_is_not_saved_in_payload_logs(self) -> None:
        _, api_key = self.create_integration_source()
        payload = self.make_payload()
        payload["metadata"]["xIntegrationKey"] = api_key
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=payload,
        )
        self.assertEqual(response.status_code, 201, response.text)

        session = self.SessionLocal()
        try:
            payload_log = session.scalar(select(CrmExternalLeadPayloadLog))
            self.assertIsNotNone(payload_log)
            self.assertIsNone(payload_log.raw_payload)
            lead = session.scalar(select(CrmExternalLeadSubmission))
            self.assertIsNotNone(lead)
            self.assertIsNone(lead.raw_payload)
        finally:
            session.close()

    def test_invalid_credential_has_no_database_side_effects(self) -> None:
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": "els_invalid_credential"},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 401, response.text)
        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmClient)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadSubmission)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadPayloadLog)), 0)
        finally:
            session.close()

    def test_external_lead_body_limit_rejects_before_side_effects(self) -> None:
        _, api_key = self.create_integration_source()
        settings = get_settings()
        original_limit = settings.external_lead_max_body_bytes
        settings.external_lead_max_body_bytes = 1024
        try:
            payload = self.make_payload()
            payload["request"]["message"] = "x" * 2000
            response = self.client.post(
                "/api/integrations/external-leads",
                headers={"X-Integration-Key": api_key},
                json=payload,
            )
        finally:
            settings.external_lead_max_body_bytes = original_limit
        self.assertEqual(response.status_code, 413, response.text)
        session = self.SessionLocal()
        try:
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmClient)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(CrmExternalLeadSubmission)), 0)
        finally:
            session.close()

    def test_spoofed_forwarded_headers_do_not_bypass_external_rate_limit(self) -> None:
        settings = get_settings()
        original_attempts = settings.external_lead_rate_limit_attempts
        settings.external_lead_rate_limit_attempts = 2
        try:
            responses = [
                self.client.post(
                    "/api/integrations/external-leads",
                    headers={"X-Forwarded-For": f"203.0.113.{index}"},
                    json=self.make_payload(),
                )
                for index in range(1, 4)
            ]
        finally:
            settings.external_lead_rate_limit_attempts = original_attempts
        self.assertEqual([response.status_code for response in responses], [401, 401, 429])
        self.assertGreater(int(responses[-1].headers["Retry-After"]), 0)

    def test_response_shape_is_stable(self) -> None:
        _, api_key = self.create_integration_source()
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(set(response.json().keys()), {"success", "leadId", "customerId", "orderId", "status"})

    def test_allowed_domains_match_page_url(self) -> None:
        _, api_key = self.create_integration_source(allowed_domains=["leads.example.invalid"])
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 201, response.text)

    def test_disallowed_domain_is_rejected(self) -> None:
        _, api_key = self.create_integration_source(allowed_domains=["allowed.example.com"])
        response = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(response.json(), {"success": False, "error": "unauthorized"})

    def test_summary_endpoint_returns_correct_counts(self) -> None:
        _, api_key = self.create_integration_source()
        headers = {"X-Integration-Key": api_key}
        first = self.client.post("/api/integrations/external-leads", headers=headers, json=self.make_payload())
        self.assertEqual(first.status_code, 201, first.text)

        session = self.SessionLocal()
        try:
            first_lead = session.scalar(select(CrmExternalLeadSubmission))
            self.assertIsNotNone(first_lead)
            first_lead.status = "in_work"
            second_lead = CrmExternalLeadSubmission(
                integration_source_id=first_lead.integration_source_id,
                client_id=first_lead.client_id,
                phone_normalized="+70000000025",
                customer_name="Пётр",
                customer_phone_raw="+70000000025",
                status="new",
                dedupe_status="unique",
                source_type="website",
                source_name="Another landing",
            )
            third_lead = CrmExternalLeadSubmission(
                integration_source_id=first_lead.integration_source_id,
                client_id=first_lead.client_id,
                phone_normalized="+70000000026",
                customer_name="Спам",
                customer_phone_raw="+70000000026",
                status="spam",
                dedupe_status="unique",
                source_type="website",
                source_name="Spam source",
            )
            session.add_all([second_lead, third_lead])
            session.commit()
        finally:
            session.close()

        response = self.client.get("/api/integrations/external-leads/summary", headers=self.auth_headers())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"newCount": 1, "inWorkCount": 1, "totalOpenCount": 2})

    def test_summary_endpoint_requires_crm_auth(self) -> None:
        response = self.client.get("/api/integrations/external-leads/summary")
        self.assertEqual(response.status_code, 401, response.text)

    def test_external_integration_key_cannot_access_internal_summary_endpoint(self) -> None:
        _, api_key = self.create_integration_source()
        response = self.client.get(
            "/api/integrations/external-leads/summary",
            headers={"X-Integration-Key": api_key},
        )
        self.assertEqual(response.status_code, 401, response.text)

    def test_external_integration_key_cannot_access_internal_list_detail_or_patch_endpoints(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(created.status_code, 201, created.text)
        lead_id = created.json()["leadId"]

        list_response = self.client.get("/api/integrations/external-leads", headers={"X-Integration-Key": api_key})
        detail_response = self.client.get(f"/api/integrations/external-leads/{lead_id}", headers={"X-Integration-Key": api_key})
        patch_response = self.client.patch(
            f"/api/integrations/external-leads/{lead_id}",
            headers={"X-Integration-Key": api_key},
            json={"status": "in_work"},
        )

        self.assertEqual(list_response.status_code, 401, list_response.text)
        self.assertEqual(detail_response.status_code, 401, detail_response.text)
        self.assertEqual(patch_response.status_code, 401, patch_response.text)

    def test_list_endpoint_filters_by_status_and_search(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(created.status_code, 201, created.text)
        lead_id = created.json()["leadId"]
        self.client.patch(
            f"/api/integrations/external-leads/{lead_id}",
            headers=self.auth_headers(),
            json={"status": "in_work"},
        )

        session = self.SessionLocal()
        try:
            source = session.scalar(select(CrmIntegrationSource))
            another_lead = CrmExternalLeadSubmission(
                integration_source_id=source.id,
                client_id=None,
                phone_normalized="+70000000024",
                customer_name="Мария",
                customer_phone_raw="+70000000024",
                status="new",
                dedupe_status="unique",
                source_type="website",
                source_name="Quiz page",
                form_name="quiz_form",
                package_name="Полировка",
            )
            session.add(another_lead)
            session.commit()
        finally:
            session.close()

        in_work_response = self.client.get(
            "/api/integrations/external-leads?status=in_work",
            headers=self.auth_headers(),
        )
        self.assertEqual(in_work_response.status_code, 200, in_work_response.text)
        self.assertEqual(len(in_work_response.json()), 1)
        self.assertEqual(in_work_response.json()[0]["id"], lead_id)

        search_response = self.client.get(
            "/api/integrations/external-leads?search=quiz",
            headers=self.auth_headers(),
        )
        self.assertEqual(search_response.status_code, 200, search_response.text)
        self.assertEqual(len(search_response.json()), 1)
        self.assertEqual(search_response.json()[0]["form_name"], "quiz_form")

    def test_detail_endpoint_returns_one_lead(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        lead_id = created.json()["leadId"]

        response = self.client.get(f"/api/integrations/external-leads/{lead_id}", headers=self.auth_headers())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], lead_id)
        self.assertEqual(response.json()["source_name"], "Demo Service Website")
        self.assertIn("raw_payload", response.json())

    def test_invalid_status_is_rejected(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        lead_id = created.json()["leadId"]

        response = self.client.patch(
            f"/api/integrations/external-leads/{lead_id}",
            headers=self.auth_headers(),
            json={"status": "bad_status"},
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["error"]["code"], "validation_error")

    def test_status_update_changes_updated_at(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        lead_id = created.json()["leadId"]

        session = self.SessionLocal()
        try:
            lead = session.get(CrmExternalLeadSubmission, lead_id)
            before_updated_at = lead.updated_at
        finally:
            session.close()

        response = self.client.patch(
            f"/api/integrations/external-leads/{lead_id}",
            headers=self.auth_headers(),
            json={"status": "in_work"},
        )
        self.assertEqual(response.status_code, 200, response.text)

        session = self.SessionLocal()
        try:
            lead = session.get(CrmExternalLeadSubmission, lead_id)
            self.assertGreater(lead.updated_at, before_updated_at)
        finally:
            session.close()

    def test_employee_without_orders_view_cannot_read_external_leads(self) -> None:
        self.update_employee_permissions([{"permission_code": "orders.view", "is_allowed": False}])
        response = self.client.get("/api/integrations/external-leads/summary", headers=self.auth_headers())
        self.assertEqual(response.status_code, 403, response.text)

    def test_employee_without_orders_edit_cannot_change_external_lead_status(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        lead_id = created.json()["leadId"]
        self.update_employee_permissions([{"permission_code": "orders.edit", "is_allowed": False}])

        response = self.client.patch(
            f"/api/integrations/external-leads/{lead_id}",
            headers=self.auth_headers(),
            json={"status": "in_work"},
        )
        self.assertEqual(response.status_code, 403, response.text)

    def test_statuses_counted_correctly_after_status_update(self) -> None:
        _, api_key = self.create_integration_source()
        created = self.client.post(
            "/api/integrations/external-leads",
            headers={"X-Integration-Key": api_key},
            json=self.make_payload(),
        )
        self.assertEqual(created.status_code, 201, created.text)
        lead_id = created.json()["leadId"]

        update_response = self.client.patch(
            f"/api/integrations/external-leads/{lead_id}",
            headers=self.auth_headers(),
            json={"status": "in_work"},
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        self.assertEqual(update_response.json()["status"], "in_work")

        summary_response = self.client.get("/api/integrations/external-leads/summary", headers=self.auth_headers())
        self.assertEqual(summary_response.status_code, 200, summary_response.text)
        self.assertEqual(summary_response.json(), {"newCount": 0, "inWorkCount": 1, "totalOpenCount": 1})

        session = self.SessionLocal()
        try:
            audit_logs = list(
                session.scalars(
                    select(CrmAuditLog).where(
                        CrmAuditLog.entity_type == "external_lead_submission",
                        CrmAuditLog.entity_id == lead_id,
                        CrmAuditLog.action == "status_update",
                    )
                )
            )
            self.assertEqual(len(audit_logs), 1)
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main()
