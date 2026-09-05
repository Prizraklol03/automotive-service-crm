from __future__ import annotations

import sys
import unittest
from io import BytesIO
import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.deps import get_db  # noqa: E402
from app.api.routers import api_router  # noqa: E402
from app.core.errors import register_exception_handlers  # noqa: E402
from app.crm.auth.permissions import ALL_PERMISSION_CODES  # noqa: E402
from app.crm.models.audit_log import CrmAuditLog  # noqa: E402
from app.crm.models.reminder import CrmReminder, ReminderStatus  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.models.user import CrmUser  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.core.time import app_now_naive  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.db.base import Base  # noqa: E402
from PIL import Image  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class CrmApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.templates_dir = TemporaryDirectory()
        self.previous_templates_dir = os.environ.get("DOCUMENT_TEMPLATES_DIR")
        os.environ["DOCUMENT_TEMPLATES_DIR"] = self.templates_dir.name
        self._seed_test_document_templates(Path(self.templates_dir.name))
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
            user_service.create_user(
                UserCreate(role_id=roles["admin"].id, full_name="Demo Customer 01", login="admin", password="admin-test-pass-2026")
            )
            user_service.create_user(
                UserCreate(role_id=roles["standard_user"].id, full_name="Demo Customer 02", login="employee", password="employee-test-pass-2026")
            )
            session.add_all(
                [
                    CrmOrderStatus(
                        code="new",
                        display_name="Новый",
                        status_group=StatusGroup.NEW.value,
                        color="#6b7280",
                        sort_order=10,
                        is_default=True,
                    ),
                    CrmOrderStatus(
                        code="in_progress",
                        display_name="В работе",
                        status_group=StatusGroup.IN_PROGRESS.value,
                        color="#2563eb",
                        sort_order=20,
                        is_default=False,
                    ),
                    CrmOrderStatus(
                        code="done",
                        display_name="Готово",
                        status_group=StatusGroup.DONE.value,
                        color="#10b981",
                        sort_order=30,
                        is_default=False,
                    ),
                    CrmOrderStatus(
                        code="closed",
                        display_name="Выдан",
                        status_group=StatusGroup.CLOSED.value,
                        color="#0f766e",
                        sort_order=40,
                        is_default=False,
                    ),
                    CrmOrderStatus(
                        code="cancelled",
                        display_name="Отменён",
                        status_group=StatusGroup.CANCELLED.value,
                        color="#ef4444",
                        sort_order=50,
                        is_default=False,
                    ),
                ]
            )
            session.commit()
        finally:
            session.close()

    def tearDown(self) -> None:
        self.client.close()
        self.db_harness.close()
        if self.previous_templates_dir is None:
            os.environ.pop("DOCUMENT_TEMPLATES_DIR", None)
        else:
            os.environ["DOCUMENT_TEMPLATES_DIR"] = self.previous_templates_dir
        self.templates_dir.cleanup()

    def _seed_test_document_templates(self, target_dir: Path) -> None:
        templates = {
            "ПредварительныйЗаказНаряд шаблон.docx": """
                <w:p><w:r><w:t>Предварительный заказ-наряд № {{doc.no}} от {{doc.date}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{client.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{payer.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{order.ready_at}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{#client.legal}}LEGAL{{/client.legal}}</w:t></w:r></w:p>
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>{{n}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.name}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{qty}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{price}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{sum}}</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
                <w:p><w:r><w:t>{{total}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{disc}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{pay}}</w:t></w:r></w:p>
            """,
            "Рабочий заказ-наряд шаблон.docx": """
                <w:p><w:r><w:t>Рабочий заказ-наряд № {{doc.no}} от {{doc.date}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{client.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{order.repair_type}}</w:t></w:r></w:p>
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>{{srv.name}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.cat}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.qty}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.comment}}</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
                <w:p><w:r><w:t>{{services.count}}</w:t></w:r></w:p>
            """,
            "Заказ наряд шаблон.docx": """
                <w:p><w:r><w:t>Заказ-наряд № {{doc.no}} от {{doc.date}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{#client.individual}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{client.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{/client.individual}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{#client.legal}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{client.org_name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{/client.legal}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{#payer.individual}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{payer.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{/payer.individual}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{#payer.legal}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{payer.org_name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{/payer.legal}}</w:t></w:r></w:p>
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>{{n}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.name}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{qty}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{price}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{sum}}</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
                <w:p><w:r><w:t>{{total}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{disc}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{pay}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{client.sign_name}}</w:t></w:r></w:p>
            """,
            "Акт приёма передачи авто шаблон.docx": """
                <w:p><w:r><w:t>Акт приёма-передачи автомобиля № {{doc.no}} от {{doc.date}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{client.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{owner.name}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{car.brand}} {{car.model}}</w:t></w:r></w:p>
                <w:p><w:r><w:t>{{car.color}}</w:t></w:r></w:p>
            """,
        }
        target_dir.mkdir(parents=True, exist_ok=True)
        for filename, body in templates.items():
            (target_dir / filename).write_bytes(self.make_template_docx_bytes(body))

    def make_template_docx_bytes(self, body_inner_xml: str) -> bytes:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "[Content_Types].xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                </Types>""",
            )
            archive.writestr(
                "_rels/.rels",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                </Relationships>""",
            )
            archive.writestr(
                "word/document.xml",
                f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                  <w:body>
                    {body_inner_xml}
                  </w:body>
                </w:document>""",
            )
        buffer.seek(0)
        return buffer.read()

    def auth_headers(self, login: str, password: str) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def auth_tokens(self, login: str, password: str) -> dict[str, str]:
        response = self.client.post("/api/auth/login", json={"login": login, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_client_and_vehicle(self, headers: dict[str, str]) -> tuple[int, int]:
        client_response = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 03", "phone": "+70000000001", "telegram_username": "@ivan", "comment": None},
            headers=headers,
        )
        self.assertEqual(client_response.status_code, 201, client_response.text)
        client_id = client_response.json()["id"]

        vehicle_response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": "A777AA00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Lada",
                "model": "Vesta",
                "year": 2022,
                "mileage": 54000,
                "color": "Black",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(vehicle_response.status_code, 201, vehicle_response.text)
        return client_id, vehicle_response.json()["id"]

    def create_order_for_documents(self, headers: dict[str, str]) -> int:
        client_id, vehicle_id = self.create_client_and_vehicle(headers)
        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Docs order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Manual Wash",
                        "category_name_snapshot": "Wash",
                        "unit_price": "1500.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        return order_response.json()["id"]

    def create_service_category(self, headers: dict[str, str], name: str = "Малярные работы") -> int:
        response = self.client.post(
            "/api/service-categories",
            json={"is_active": True, "name": name, "sort_order": 0},
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_service(self, headers: dict[str, str], category_id: int, name: str, default_price: str = "1000.00") -> dict:
        response = self.client.post(
            "/api/services",
            json={
                "category_id": category_id,
                "name": name,
                "default_price": default_price,
                "is_active": True,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_order_for_template_documents(self, headers: dict[str, str]) -> int:
        client_id, vehicle_id = self.create_client_and_vehicle(headers)
        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "closed",
                "comment": "Template docs order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка кузова",
                        "category_name_snapshot": "Детейлинг",
                        "unit_price": "1000.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        return order_response.json()["id"]

    def create_order_for_inspection(self, headers: dict[str, str]) -> int:
        client_id, vehicle_id = self.create_client_and_vehicle(headers)
        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Inspection order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Осмотр кузова",
                        "category_name_snapshot": "Детейлинг",
                        "unit_price": "2500.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        return order_response.json()["id"]

    def make_test_image_upload(self, filename: str = "inspection.jpg") -> tuple[str, BytesIO, str]:
        buffer = BytesIO()
        image = Image.new("RGB", (160, 120), color=(78, 168, 255))
        image.save(buffer, format="JPEG")
        buffer.seek(0)
        return (filename, buffer, "image/jpeg")

    def make_test_docx_upload(
        self,
        filename: str = "template.docx",
        body_text: str = "Шаблон документа",
    ) -> tuple[str, BytesIO, str]:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "[Content_Types].xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                </Types>""",
            )
            archive.writestr(
                "_rels/.rels",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                </Relationships>""",
            )
            archive.writestr(
                "word/document.xml",
                f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                  <w:body>
                    <w:p><w:r><w:t>{body_text}</w:t></w:r></w:p>
                    <w:p><w:r><w:t>{{{{client.name}}}}</w:t></w:r></w:p>
                    <w:p><w:r><w:t>{{{{pay}}}}</w:t></w:r></w:p>
                  </w:body>
                </w:document>""",
            )
        buffer.seek(0)
        return (
            filename,
            buffer,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    def read_docx_text(self, storage_path: str) -> str:
        with zipfile.ZipFile(storage_path) as archive:
            xml_text = archive.read("word/document.xml").decode("utf-8")
        return xml_text

    def read_docx_all_xml_text(self, storage_path: str) -> str:
        chunks: list[str] = []
        with zipfile.ZipFile(storage_path) as archive:
            for name in archive.namelist():
                if name == "word/document.xml" or (
                    name.startswith("word/header") and name.endswith(".xml")
                ) or (
                    name.startswith("word/footer") and name.endswith(".xml")
                ):
                    chunks.append(archive.read(name).decode("utf-8"))
        return "\n".join(chunks)

    def create_client_reminder(self, headers: dict[str, str], client_id: int, **overrides) -> dict:
        payload = {
            "text": "Call client",
            "due_at": (datetime.now(UTC) - timedelta(minutes=30)).isoformat(),
            "repeat_rule": None,
        }
        payload.update(overrides)
        response = self.client.post(f"/api/clients/{client_id}/reminders", json=payload, headers=headers)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_order_reminder(self, headers: dict[str, str], order_id: int, **overrides) -> dict:
        payload = {
            "text": "Check order",
            "due_at": (datetime.now(UTC) - timedelta(minutes=15)).isoformat(),
            "repeat_rule": None,
        }
        payload.update(overrides)
        response = self.client.post(f"/api/orders/{order_id}/reminders", json=payload, headers=headers)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_login_success_and_me(self) -> None:
        data = self.auth_tokens("admin", "admin-test-pass-2026")
        self.assertIn("access_token", data)
        self.assertIn("refresh_token", data)

        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["user"]["role_code"], "admin")
        self.assertIn("orders.view", me.json()["permissions"])

    def test_login_failure(self) -> None:
        response = self.client.post("/api/auth/login", json={"login": "admin", "password": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["message"], "Неверный логин или пароль")

    def test_admin_can_login_with_new_password_after_reset(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        tokens = self.auth_tokens("admin", "admin-test-pass-2026")

        session = self.SessionLocal()
        try:
            admin_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "admin"))
        finally:
            session.close()

        reset = self.client.patch(
            f"/api/users/{admin_id}/reset-password",
            json={"new_password": "new-admin-test-pass-2026"},
            headers=headers,
        )
        self.assertEqual(reset.status_code, 200, reset.text)

        old_login = self.client.post("/api/auth/login", json={"login": "admin", "password": "admin-test-pass-2026"})
        self.assertEqual(old_login.status_code, 401, old_login.text)

        old_refresh = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(old_refresh.status_code, 401, old_refresh.text)

        new_login = self.client.post("/api/auth/login", json={"login": "admin", "password": "new-admin-test-pass-2026"})
        self.assertEqual(new_login.status_code, 200, new_login.text)

    def test_admin_can_revoke_user_sessions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_tokens = self.auth_tokens("employee", "employee-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        revoked = self.client.patch(f"/api/users/{employee_id}/revoke-sessions", headers=admin_headers)
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertGreaterEqual(revoked.json()["token_version"], 2)

        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {employee_tokens['access_token']}"})
        self.assertEqual(me.status_code, 401, me.text)

        refreshed = self.client.post("/api/auth/refresh", json={"refresh_token": employee_tokens["refresh_token"]})
        self.assertEqual(refreshed.status_code, 401, refreshed.text)

    def test_password_reset_preserves_leading_and_trailing_spaces(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        new_password = "  admin-test-pass-2026-with-spaces  "

        session = self.SessionLocal()
        try:
            admin_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "admin"))
        finally:
            session.close()

        reset = self.client.patch(
            f"/api/users/{admin_id}/reset-password",
            json={"new_password": new_password},
            headers=headers,
        )
        self.assertEqual(reset.status_code, 200, reset.text)

        trimmed_login = self.client.post("/api/auth/login", json={"login": "admin", "password": new_password.strip()})
        self.assertEqual(trimmed_login.status_code, 401, trimmed_login.text)

        exact_login = self.client.post("/api/auth/login", json={"login": "admin", "password": new_password})
        self.assertEqual(exact_login.status_code, 200, exact_login.text)

    def test_material_expenses_are_created_separately_from_orders(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        category_id = self.create_service_category(headers)
        order_id = self.create_order_for_documents(headers)

        expense_response = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-03-19",
                "material_name": "Краска",
                "quantity": 2,
                "service_category_id": category_id,
                "unit_price": "500.00",
            },
            headers=headers,
        )
        self.assertEqual(expense_response.status_code, 201, expense_response.text)
        self.assertEqual(expense_response.json()["row_total"], "1000.00")

        order_response = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(order_response.status_code, 200, order_response.text)
        self.assertNotIn("profit", order_response.json())
        self.assertNotIn("materials_total", order_response.json())
        self.assertNotIn("materials", order_response.json())

        list_response = self.client.get("/api/materials", headers=headers)
        self.assertEqual(list_response.status_code, 200, list_response.text)
        self.assertEqual(len(list_response.json()), 1)
        self.assertEqual(list_response.json()[0]["service_category_name"], "Малярные работы")

    def test_material_expenses_can_be_updated_and_deleted(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        category_id = self.create_service_category(headers, "Детейлинг")

        created = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-03-19",
                "material_name": "Полироль",
                "quantity": 1,
                "service_category_id": category_id,
                "unit_price": "900.00",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        expense_id = created.json()["id"]

        updated = self.client.patch(
            f"/api/materials/{expense_id}",
            json={
                "expense_date": "2026-03-20",
                "material_name": "Полироль премиум",
                "quantity": 2,
                "service_category_id": category_id,
                "unit_price": "950.00",
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["material_name"], "Полироль премиум")
        self.assertEqual(updated.json()["row_total"], "1900.00")

        deleted = self.client.delete(f"/api/materials/{expense_id}", headers=headers)
        self.assertEqual(deleted.status_code, 204, deleted.text)

        get_deleted = self.client.get(f"/api/materials/{expense_id}", headers=headers)
        self.assertEqual(get_deleted.status_code, 404, get_deleted.text)

    def test_material_routes_allow_employee_full_access(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        category_id = self.create_service_category(admin_headers, "Химчистка")

        listed_categories = self.client.get("/api/service-categories", headers=employee_headers)
        self.assertEqual(listed_categories.status_code, 200, listed_categories.text)

        created = self.client.post(
            "/api/materials",
            json={
                "expense_date": "2026-03-24",
                "material_name": "Очиститель",
                "quantity": 3,
                "service_category_id": category_id,
                "unit_price": "300.00",
            },
            headers=employee_headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        expense_id = created.json()["id"]
        self.assertEqual(created.json()["row_total"], "900.00")

        listed = self.client.get("/api/materials?date_from=2026-03-01&date_to=2026-03-31", headers=employee_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["id"], expense_id)

        fetched = self.client.get(f"/api/materials/{expense_id}", headers=employee_headers)
        self.assertEqual(fetched.status_code, 200, fetched.text)

        updated = self.client.patch(
            f"/api/materials/{expense_id}",
            json={
                "expense_date": "2026-03-25",
                "material_name": "Очиститель премиум",
                "quantity": 4,
                "service_category_id": category_id,
                "unit_price": "350.00",
            },
            headers=employee_headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["row_total"], "1400.00")

        deleted = self.client.delete(f"/api/materials/{expense_id}", headers=employee_headers)
        self.assertEqual(deleted.status_code, 204, deleted.text)

    def test_finance_categories_are_seeded_and_manageable_for_admin(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")

        seeded = self.client.get("/api/finance/categories", headers=headers)
        self.assertEqual(seeded.status_code, 200, seeded.text)
        seeded_names = {item["name"] for item in seeded.json()}
        self.assertGreaterEqual(len(seeded_names), 6)

        created = self.client.post("/api/finance/categories", json={"name": "Реклама"}, headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        category_id = created.json()["id"]
        self.assertEqual(created.json()["name"], "Реклама")

        updated = self.client.put(f"/api/finance/categories/{category_id}", json={"name": "Маркетинг"}, headers=headers)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], "Маркетинг")

        deleted = self.client.delete(f"/api/finance/categories/{category_id}", headers=headers)
        self.assertEqual(deleted.status_code, 204, deleted.text)

    def test_finance_expenses_crud_and_summary_work_for_admin(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        categories = self.client.get("/api/finance/categories", headers=headers)
        self.assertEqual(categories.status_code, 200, categories.text)
        category = categories.json()[0]
        category_id = category["id"]

        created = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": "2026-03-20",
                "category_id": category_id,
                "comment": "Аванс мастеру",
                "amount": "25000.00",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        expense_id = created.json()["id"]
        self.assertEqual(created.json()["category_name"], category["name"])
        self.assertEqual(created.json()["created_by_user_name"], "Demo Customer 01")

        listed = self.client.get("/api/finance/expenses?date_from=2026-03-01&date_to=2026-03-31", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["id"], expense_id)

        summary = self.client.get("/api/finance/expenses/summary?date_from=2026-03-01&date_to=2026-03-31", headers=headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["total_amount"], "25000.00")

        updated = self.client.put(
            f"/api/finance/expenses/{expense_id}",
            json={
                "expense_date": "2026-03-21",
                "category_id": category_id,
                "comment": "Выплата зарплаты",
                "amount": "30000.00",
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["amount"], "30000.00")

        deleted = self.client.delete(f"/api/finance/expenses/{expense_id}", headers=headers)
        self.assertEqual(deleted.status_code, 204, deleted.text)

        missing = self.client.get(f"/api/finance/expenses/{expense_id}", headers=headers)
        self.assertEqual(missing.status_code, 404, missing.text)

    def test_finance_category_cannot_be_deleted_while_expense_exists(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        created_category = self.client.post("/api/finance/categories", json={"name": "Аренда"}, headers=headers)
        self.assertEqual(created_category.status_code, 201, created_category.text)
        category_id = created_category.json()["id"]

        created_expense = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": "2026-03-22",
                "category_id": category_id,
                "comment": "Аренда помещения",
                "amount": "50000.00",
            },
            headers=headers,
        )
        self.assertEqual(created_expense.status_code, 201, created_expense.text)

        delete_response = self.client.delete(f"/api/finance/categories/{category_id}", headers=headers)
        self.assertEqual(delete_response.status_code, 409, delete_response.text)
        self.assertEqual(delete_response.json()["error"]["code"], "category_in_use")

    def test_finance_routes_allow_employee_full_access(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        created_category = self.client.post("/api/finance/categories", json={"name": "Топливо"}, headers=employee_headers)
        self.assertEqual(created_category.status_code, 201, created_category.text)
        category_id = created_category.json()["id"]

        listed_categories = self.client.get("/api/finance/categories", headers=employee_headers)
        self.assertEqual(listed_categories.status_code, 200, listed_categories.text)
        self.assertTrue(any(item["id"] == category_id for item in listed_categories.json()))

        updated_category = self.client.put(
            f"/api/finance/categories/{category_id}",
            json={"name": "Топливо и сервис"},
            headers=employee_headers,
        )
        self.assertEqual(updated_category.status_code, 200, updated_category.text)
        self.assertEqual(updated_category.json()["name"], "Топливо и сервис")

        created_expense = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": "2026-03-26",
                "category_id": category_id,
                "comment": "Заправка",
                "amount": "4200.00",
            },
            headers=employee_headers,
        )
        self.assertEqual(created_expense.status_code, 201, created_expense.text)
        expense_id = created_expense.json()["id"]

        listed_expenses = self.client.get("/api/finance/expenses?date_from=2026-03-01&date_to=2026-03-31", headers=employee_headers)
        self.assertEqual(listed_expenses.status_code, 200, listed_expenses.text)
        self.assertEqual(len(listed_expenses.json()), 1)
        self.assertEqual(listed_expenses.json()[0]["id"], expense_id)

        summary = self.client.get("/api/finance/expenses/summary?date_from=2026-03-01&date_to=2026-03-31", headers=employee_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["total_amount"], "4200.00")

        updated_expense = self.client.put(
            f"/api/finance/expenses/{expense_id}",
            json={
                "expense_date": "2026-03-27",
                "category_id": category_id,
                "comment": "Топливо для выезда",
                "amount": "4500.00",
            },
            headers=employee_headers,
        )
        self.assertEqual(updated_expense.status_code, 200, updated_expense.text)
        self.assertEqual(updated_expense.json()["amount"], "4500.00")

        deleted_expense = self.client.delete(f"/api/finance/expenses/{expense_id}", headers=employee_headers)
        self.assertEqual(deleted_expense.status_code, 204, deleted_expense.text)

        deleted_category = self.client.delete(f"/api/finance/categories/{category_id}", headers=employee_headers)
        self.assertEqual(deleted_category.status_code, 204, deleted_category.text)

    def test_admin_auth_me_exposes_effective_permissions_without_user_permission_rows(self) -> None:
        data = self.auth_tokens("admin", "admin-test-pass-2026")
        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(set(me.json()["permissions"]), set(ALL_PERMISSION_CODES))

    def test_employee_permission_switches_are_admin_only_and_validate_codes(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
            admin_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "admin"))
        finally:
            session.close()

        employee_attempt = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "analytics.view", "is_allowed": True}]},
            headers=employee_headers,
        )
        self.assertEqual(employee_attempt.status_code, 403, employee_attempt.text)

        unknown_code = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "unknown.permission", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(unknown_code.status_code, 422, unknown_code.text)

        admin_target = self.client.patch(
            f"/api/users/{admin_id}/permissions",
            json={"permissions": [{"permission_code": "analytics.view", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(admin_target.status_code, 403, admin_target.text)

    def test_admin_can_toggle_employee_permissions_and_me_returns_effective_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        updated = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={
                "permissions": [
                    {"permission_code": "analytics.view", "is_allowed": True},
                    {"permission_code": "orders.change_prices", "is_allowed": False},
                ]
            },
            headers=admin_headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertIn("analytics.view", {item["permission_code"] for item in updated.json()["permissions"] if item["is_allowed"]})

        fetched = self.client.get(f"/api/users/{employee_id}/permissions", headers=admin_headers)
        self.assertEqual(fetched.status_code, 200, fetched.text)
        fetched_permissions = {item["permission_code"]: item["is_allowed"] for item in fetched.json()["permissions"]}
        self.assertTrue(fetched_permissions["analytics.view"])
        self.assertFalse(fetched_permissions["orders.change_prices"])

        me = self.client.get("/api/auth/me", headers=employee_headers)
        self.assertEqual(me.status_code, 200, me.text)
        self.assertIn("analytics.view", me.json()["permissions"])
        self.assertNotIn("orders.change_prices", me.json()["permissions"])

    def test_employee_analytics_access_follows_switch_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        denied = self.client.get("/api/analytics/dashboard", headers=employee_headers)
        self.assertEqual(denied.status_code, 403, denied.text)

        enabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "analytics.view", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(enabled.status_code, 200, enabled.text)

        allowed = self.client.get("/api/analytics/dashboard", headers=employee_headers)
        self.assertEqual(allowed.status_code, 200, allowed.text)

    def test_employee_finance_expense_creation_follows_switch_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        categories = self.client.get("/api/finance/categories", headers=employee_headers)
        self.assertEqual(categories.status_code, 200, categories.text)
        category_id = categories.json()[0]["id"]

        disabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "finance.expenses.create", "is_allowed": False}]},
            headers=admin_headers,
        )
        self.assertEqual(disabled.status_code, 200, disabled.text)

        forbidden = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": "2026-03-26",
                "category_id": category_id,
                "comment": "Тестовый расход",
                "amount": "4200.00",
            },
            headers=employee_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        enabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "finance.expenses.create", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(enabled.status_code, 200, enabled.text)

        created = self.client.post(
            "/api/finance/expenses",
            json={
                "expense_date": "2026-03-26",
                "category_id": category_id,
                "comment": "Тестовый расход",
                "amount": "4200.00",
            },
            headers=employee_headers,
        )
        self.assertEqual(created.status_code, 201, created.text)

    def test_employee_order_price_changes_follow_switch_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        client_id, vehicle_id = self.create_client_and_vehicle(admin_headers)
        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Price check",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка",
                        "category_name_snapshot": "Детейлинг",
                        "unit_price": "1000.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=admin_headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        order_id = order_response.json()["id"]

        disabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "orders.change_prices", "is_allowed": False}]},
            headers=admin_headers,
        )
        self.assertEqual(disabled.status_code, 200, disabled.text)

        forbidden = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Price check",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка",
                        "category_name_snapshot": "Детейлинг",
                        "unit_price": "1200.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=employee_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        enabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={"permissions": [{"permission_code": "orders.change_prices", "is_allowed": True}]},
            headers=admin_headers,
        )
        self.assertEqual(enabled.status_code, 200, enabled.text)

        allowed = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Price check",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка",
                        "category_name_snapshot": "Детейлинг",
                        "unit_price": "1200.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=employee_headers,
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)

    def test_employee_order_complete_and_documents_follow_switch_permissions(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        order_id = self.create_order_for_documents(admin_headers)

        disabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={
                "permissions": [
                    {"permission_code": "orders.complete", "is_allowed": False},
                    {"permission_code": "orders.documents", "is_allowed": False},
                ]
            },
            headers=admin_headers,
        )
        self.assertEqual(disabled.status_code, 200, disabled.text)

        complete_forbidden = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "closed", "completed_at": None},
            headers=employee_headers,
        )
        self.assertEqual(complete_forbidden.status_code, 403, complete_forbidden.text)

        documents_forbidden = self.client.get(f"/api/orders/{order_id}/documents", headers=employee_headers)
        self.assertEqual(documents_forbidden.status_code, 403, documents_forbidden.text)

        enabled = self.client.patch(
            f"/api/users/{employee_id}/permissions",
            json={
                "permissions": [
                    {"permission_code": "orders.complete", "is_allowed": True},
                    {"permission_code": "orders.documents", "is_allowed": True},
                ]
            },
            headers=admin_headers,
        )
        self.assertEqual(enabled.status_code, 200, enabled.text)

        complete_allowed = self.client.patch(
            f"/api/orders/{order_id}/status",
            json={"status": "closed", "completed_at": None},
            headers=employee_headers,
        )
        self.assertEqual(complete_allowed.status_code, 200, complete_allowed.text)

        documents_allowed = self.client.get(f"/api/orders/{order_id}/documents", headers=employee_headers)
        self.assertEqual(documents_allowed.status_code, 200, documents_allowed.text)

    def test_services_can_be_reordered_inside_category(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        category_id = self.create_service_category(headers, "Детейлинг")
        first = self.create_service(headers, category_id, "Полировка")
        second = self.create_service(headers, category_id, "Химчистка")
        third = self.create_service(headers, category_id, "Оклейка")

        listed_before = self.client.get("/api/services", headers=headers)
        self.assertEqual(listed_before.status_code, 200, listed_before.text)
        self.assertEqual(
            [item["id"] for item in listed_before.json() if item["category_id"] == category_id],
            [first["id"], second["id"], third["id"]],
        )

        reordered = self.client.put(
            "/api/services/reorder",
            json={
                "category_id": category_id,
                "items": [
                    {"id": third["id"], "sort_order": 1},
                    {"id": first["id"], "sort_order": 2},
                    {"id": second["id"], "sort_order": 3},
                ],
            },
            headers=headers,
        )
        self.assertEqual(reordered.status_code, 200, reordered.text)
        self.assertEqual([item["id"] for item in reordered.json()], [third["id"], first["id"], second["id"]])

        listed_after = self.client.get("/api/services", headers=headers)
        self.assertEqual(listed_after.status_code, 200, listed_after.text)
        self.assertEqual(
            [item["id"] for item in listed_after.json() if item["category_id"] == category_id],
            [third["id"], first["id"], second["id"]],
        )

    def test_service_categories_can_be_reordered_by_admin_only(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        first_id = self.create_service_category(admin_headers, "Первая")
        second_id = self.create_service_category(admin_headers, "Вторая")
        third_id = self.create_service_category(admin_headers, "Третья")

        forbidden = self.client.put(
            "/api/service-categories/reorder",
            json={
                "items": [
                    {"id": third_id, "sort_order": 1},
                    {"id": first_id, "sort_order": 2},
                    {"id": second_id, "sort_order": 3},
                ]
            },
            headers=employee_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        incomplete = self.client.put(
            "/api/service-categories/reorder",
            json={"items": [{"id": third_id, "sort_order": 1}]},
            headers=admin_headers,
        )
        self.assertEqual(incomplete.status_code, 422, incomplete.text)

        reordered = self.client.put(
            "/api/service-categories/reorder",
            json={
                "items": [
                    {"id": third_id, "sort_order": 1},
                    {"id": first_id, "sort_order": 2},
                    {"id": second_id, "sort_order": 3},
                ]
            },
            headers=admin_headers,
        )
        self.assertEqual(reordered.status_code, 200, reordered.text)
        self.assertEqual([item["id"] for item in reordered.json()], [third_id, first_id, second_id])

    def test_refresh_rejects_inactive_user(self) -> None:
        tokens = self.auth_tokens("employee", "employee-test-pass-2026")
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        deactivate = self.client.patch(
            f"/api/users/{employee_id}/active",
            json={"is_active": False},
            headers=admin_headers,
        )
        self.assertEqual(deactivate.status_code, 200, deactivate.text)

        refreshed = self.client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(refreshed.status_code, 401, refreshed.text)

    def test_role_guard_blocks_standard_user_from_user_management(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        response = self.client.get("/api/users", headers=headers)
        self.assertEqual(response.status_code, 403, response.text)

    def test_admin_can_manage_users(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")

        created = self.client.post(
            "/api/users",
            json={
                "role_code": "standard_user",
                "full_name": "Demo Customer 04",
                "login": "new-employee",
                "password": "employee-test-pass-2026-2",
                "is_active": True,
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        user_id = created.json()["id"]
        self.assertEqual(created.json()["role_code"], "standard_user")

        rejected_legacy_role = self.client.post(
            "/api/users",
            json={
                "role_code": "employee",
                "full_name": "Demo Customer 05",
                "login": "legacy-role-user",
                "password": "legacy-role-pass",
            },
            headers=headers,
        )
        self.assertEqual(rejected_legacy_role.status_code, 404, rejected_legacy_role.text)

        listing = self.client.get("/api/users", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertTrue(any(user["login"] == "new-employee" for user in listing.json()))

        updated = self.client.put(
            f"/api/users/{user_id}",
            json={
                "role_code": "admin",
                "full_name": "Demo Customer 06",
                "login": "new-admin",
                "is_active": True,
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["role_code"], "admin")

        deactivated = self.client.patch(
            f"/api/users/{user_id}/active",
            json={"is_active": False},
            headers=headers,
        )
        self.assertEqual(deactivated.status_code, 200, deactivated.text)
        self.assertFalse(deactivated.json()["is_active"])

    def test_admin_can_view_employee_activity_feed(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        client_response = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 07", "phone": "+70000000016", "telegram_username": None, "comment": None},
            headers=employee_headers,
        )
        self.assertEqual(client_response.status_code, 201, client_response.text)
        client_id = client_response.json()["id"]

        vehicle_response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": "X123XX00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "BMW",
                "model": "X5",
                "year": 2023,
                "mileage": 12000,
                "color": "Black",
                "comment": None,
            },
            headers=employee_headers,
        )
        self.assertEqual(vehicle_response.status_code, 201, vehicle_response.text)

        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_response.json()["id"],
                "status": "new",
                "comment": "Employee order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Полировка",
                        "category_name_snapshot": "Детейлинг",
                        "unit_price": "5000.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=employee_headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)

        reminder_response = self.client.post(
            f"/api/orders/{order_response.json()['id']}/reminders",
            json={
                "text": "Перезвонить клиенту",
                "due_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
                "repeat_rule": None,
            },
            headers=employee_headers,
        )
        self.assertEqual(reminder_response.status_code, 201, reminder_response.text)

        employee_list = self.client.get("/api/users", headers=admin_headers)
        self.assertEqual(employee_list.status_code, 200, employee_list.text)
        employee_id = next(item["id"] for item in employee_list.json() if item["login"] == "employee")

        activity_response = self.client.get(f"/api/users/{employee_id}/activity", headers=admin_headers)
        self.assertEqual(activity_response.status_code, 200, activity_response.text)
        payload = activity_response.json()
        self.assertEqual(payload["user_id"], employee_id)

        titles = [item["title"] for item in payload["activities"]]
        self.assertGreaterEqual(len(titles), 4)

    def test_employee_activity_feed_repairs_order_mojibake_titles(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
            corrupted_title = "Создан заказ #84".encode("utf-8").decode("cp1251")
            corrupted_description = "Клиент ID: 79, авто ID: 85, Начальный статус: draft".encode("utf-8").decode("cp1251")
            session.add(
                CrmAuditLog(
                    actor_user_id=employee_id,
                    entity_type="order",
                    entity_id=84,
                    action="create",
                    title=corrupted_title,
                    description=corrupted_description,
                )
            )
            session.commit()
        finally:
            session.close()

        activity_response = self.client.get(f"/api/users/{employee_id}/activity", headers=admin_headers)
        self.assertEqual(activity_response.status_code, 200, activity_response.text)
        payload = activity_response.json()
        order_entry = next(item for item in payload["activities"] if item["entity_type"] == "order")
        self.assertEqual(order_entry["title"], "Создан заказ #84")
        self.assertEqual(order_entry["description"], "Клиент ID: 79, авто ID: 85, Начальный статус: draft")

    def test_employee_forbidden_from_catalog_management(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        response = self.client.post(
            "/api/service-categories",
            json={"name": "Wash", "sort_order": 0, "is_active": True},
            headers=headers,
        )
        self.assertEqual(response.status_code, 403, response.text)

    def test_admin_allowed_to_manage_catalog(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        category_response = self.client.post(
            "/api/service-categories",
            json={"name": "Wash", "sort_order": 0, "is_active": True},
            headers=headers,
        )
        self.assertEqual(category_response.status_code, 201, category_response.text)
        category_id = category_response.json()["id"]

        service_response = self.client.post(
            "/api/services",
            json={"category_id": category_id, "name": "Full Package", "default_price": "2500.00", "is_active": True},
            headers=headers,
        )
        self.assertEqual(service_response.status_code, 201, service_response.text)

    def test_admin_can_manage_car_brands_and_models(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")

        brand = self.client.post(
            "/api/car-brands",
            json={"name": "Toyota", "sort_order": 1, "is_active": True},
            headers=headers,
        )
        self.assertEqual(brand.status_code, 201, brand.text)
        brand_id = brand.json()["id"]

        model = self.client.post(
            "/api/car-models",
            json={"brand_id": brand_id, "name": "Camry", "sort_order": 1, "is_active": True},
            headers=headers,
        )
        self.assertEqual(model.status_code, 201, model.text)
        model_id = model.json()["id"]

        listing = self.client.get(f"/api/car-models/by-brand/{brand_id}", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(listing.json()[0]["id"], model_id)

    def test_employee_allowed_to_create_and_edit_clients_vehicles_orders(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)

        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Initial",
                "discount_value": "100.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Manual Wash",
                        "category_name_snapshot": "Wash",
                        "unit_price": "1000.00",
                        "quantity": 2,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        order = order_response.json()
        self.assertEqual(order["services_total"], "2000.00")
        self.assertEqual(order["amount_to_pay"], "1900.00")

        update_response = self.client.put(
            f"/api/orders/{order['id']}",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "closed",
                "comment": "Updated",
                "discount_value": "50.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Manual Wash",
                        "category_name_snapshot": "Wash",
                        "unit_price": "1200.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        updated = update_response.json()
        self.assertEqual(updated["status"], "closed")
        self.assertEqual(updated["amount_to_pay"], "1150.00")
        self.assertTrue(updated["is_archived"])

    def test_order_schedule_fields_accept_and_return_datetime(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)

        created = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "scheduled_for": "2026-04-10T09:30:00",
                "due_date": "2026-04-11T18:45:00",
                "comment": "Schedule with time",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        order_id = created.json()["id"]
        self.assertEqual(created.json()["scheduled_for"], "2026-04-10T09:30:00")
        self.assertEqual(created.json()["due_date"], "2026-04-11T18:45:00")

        updated = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "scheduled_for": "2026-04-12T10:15:00",
                "due_date": "2026-04-13T20:00:00",
                "comment": "Schedule updated",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["scheduled_for"], "2026-04-12T10:15:00")
        self.assertEqual(updated.json()["due_date"], "2026-04-13T20:00:00")

        summary = self.client.get("/api/orders/search?q=A777AA00", headers=headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()[0]["scheduled_for"], "2026-04-12T10:15:00")
        self.assertEqual(summary.json()[0]["due_date"], "2026-04-13T20:00:00")

    def test_client_telegram_username_is_normalized_on_create_and_update(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")

        created = self.client.post(
            "/api/clients",
            json={
                "full_name": "Demo Customer 08",
                "phone": "+70000000017",
                "telegram_username": "  @@sheolerx  ",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        client_id = created.json()["id"]
        self.assertEqual(created.json()["telegram_username"], "@sheolerx")

        updated = self.client.put(
            f"/api/clients/{client_id}",
            json={
                "full_name": "Demo Customer 08",
                "phone": "+70000000017",
                "telegram_username": "@sheolerx",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["telegram_username"], "@sheolerx")

        cleared = self.client.put(
            f"/api/clients/{client_id}",
            json={
                "full_name": "Demo Customer 08",
                "phone": "+70000000017",
                "telegram_username": "   ",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["telegram_username"])

    def test_client_phone_is_normalized_on_create_and_update(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")

        created = self.client.post(
            "/api/clients",
            json={
                "full_name": "Demo Customer 09",
                "phone": "8 000 000 00 18",
                "telegram_username": None,
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        client = created.json()
        self.assertEqual(client["phone_display"], "+70000000018")
        self.assertEqual(client["phone_normalized"], "+70000000018")

        updated = self.client.put(
            f"/api/clients/{client['id']}",
            json={
                "full_name": "Demo Customer 09",
                "phone": "+7 (000) 000-00-18",
                "telegram_username": None,
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["phone_display"], "+70000000018")
        self.assertEqual(updated.json()["phone_normalized"], "+70000000018")

    def test_client_archive_hides_client_and_cascades_active_vehicles(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)

        archived = self.client.patch(f"/api/clients/{client_id}/archive", headers=headers)
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertTrue(archived.json()["is_deleted"])
        self.assertIsNotNone(archived.json()["deleted_at"])

        listing = self.client.get("/api/clients", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertFalse(any(client["id"] == client_id for client in listing.json()))

        search = self.client.get("/api/clients/search?q=Ivan Petrov", headers=headers)
        self.assertEqual(search.status_code, 200, search.text)
        self.assertFalse(any(client["id"] == client_id for client in search.json()))

        details = self.client.get(f"/api/clients/{client_id}", headers=headers)
        self.assertEqual(details.status_code, 200, details.text)
        self.assertTrue(details.json()["is_deleted"])

        vehicle_details = self.client.get(f"/api/vehicles/{vehicle_id}", headers=headers)
        self.assertEqual(vehicle_details.status_code, 200, vehicle_details.text)
        self.assertTrue(vehicle_details.json()["is_deleted"])

        vehicle_listing = self.client.get("/api/vehicles", headers=headers)
        self.assertEqual(vehicle_listing.status_code, 200, vehicle_listing.text)
        self.assertFalse(any(vehicle["id"] == vehicle_id for vehicle in vehicle_listing.json()))

        duplicate = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 10", "phone": "+70000000001", "telegram_username": None, "comment": None},
            headers=headers,
        )
        self.assertEqual(duplicate.status_code, 409, duplicate.text)

    def test_vehicle_archive_hides_vehicle_but_existing_order_stays_readable(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)

        created = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Archive-safe order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        order_id = created.json()["id"]

        archived = self.client.patch(f"/api/vehicles/{vehicle_id}/archive", headers=headers)
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertTrue(archived.json()["is_deleted"])

        listing = self.client.get("/api/vehicles", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertFalse(any(vehicle["id"] == vehicle_id for vehicle in listing.json()))

        search = self.client.get("/api/vehicles/search?q=A777AA00", headers=headers)
        self.assertEqual(search.status_code, 200, search.text)
        self.assertFalse(any(vehicle["id"] == vehicle_id for vehicle in search.json()))

        order_details = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(order_details.status_code, 200, order_details.text)
        self.assertEqual(order_details.json()["vehicle_id"], vehicle_id)

        updated = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Updated with archived vehicle still linked",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["vehicle_id"], vehicle_id)

        duplicate = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": "A777AA00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Lada",
                "model": "Vesta",
                "year": 2022,
                "mileage": 54000,
                "color": "Black",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(duplicate.status_code, 409, duplicate.text)

    def test_search_endpoints_and_vehicle_reassignment(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        first_client_response = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 03", "phone": "+7 (000) 000-00-01", "telegram_username": "@ivan", "comment": None},
            headers=employee_headers,
        )
        self.assertEqual(first_client_response.status_code, 201, first_client_response.text)
        first_client_id = first_client_response.json()["id"]

        second_client_response = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 11", "phone": "+7 (000) 000-00-02", "telegram_username": None, "comment": None},
            headers=employee_headers,
        )
        self.assertEqual(second_client_response.status_code, 201, second_client_response.text)
        second_client_id = second_client_response.json()["id"]

        brand = self.client.post(
            "/api/car-brands",
            json={"name": "BMW", "sort_order": 0, "is_active": True},
            headers=admin_headers,
        )
        brand_id = brand.json()["id"]
        model = self.client.post(
            "/api/car-models",
            json={"brand_id": brand_id, "name": "X5", "sort_order": 0, "is_active": True},
            headers=admin_headers,
        )
        model_id = model.json()["id"]

        vehicle_response = self.client.post(
            "/api/vehicles",
            json={
                "client_id": first_client_id,
                "plate_number": "A 777 AA 00",
                "vin": "wauzzz8v1ja000001",
                "brand_id": brand_id,
                "model_id": model_id,
                "brand": None,
                "model": None,
                "year": 2023,
                "mileage": 1000,
                "color": None,
                "comment": None,
            },
            headers=employee_headers,
        )
        self.assertEqual(vehicle_response.status_code, 201, vehicle_response.text)
        vehicle_id = vehicle_response.json()["id"]

        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": first_client_id,
                "vehicle_id": vehicle_id,
                "status": "closed",
                "comment": "Searchable order",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=employee_headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        order_id = order_response.json()["id"]

        client_search = self.client.get("/api/clients/search?q=99912345", headers=employee_headers)
        self.assertEqual(client_search.status_code, 200, client_search.text)
        self.assertEqual(len(client_search.json()), 2)

        telegram_search = self.client.get("/api/clients/search?q=@ivan", headers=employee_headers)
        self.assertEqual(telegram_search.status_code, 200, telegram_search.text)
        self.assertEqual(len(telegram_search.json()), 1)
        self.assertEqual(telegram_search.json()[0]["id"], first_client_id)

        vehicle_search = self.client.get("/api/vehicles/search?q=a-777-aa-77", headers=employee_headers)
        self.assertEqual(vehicle_search.status_code, 200, vehicle_search.text)
        self.assertEqual(vehicle_search.json()[0]["id"], vehicle_id)

        vehicle_search_by_vin = self.client.get("/api/vehicles/search?q=wauzzz8v1ja000001", headers=employee_headers)
        self.assertEqual(vehicle_search_by_vin.status_code, 200, vehicle_search_by_vin.text)
        self.assertEqual(vehicle_search_by_vin.json()[0]["id"], vehicle_id)

        order_search = self.client.get("/api/orders/search?q=Ivan Petrov", headers=employee_headers)
        self.assertEqual(order_search.status_code, 200, order_search.text)
        self.assertEqual(order_search.json()[0]["id"], order_id)

        order_search_by_vin = self.client.get("/api/orders/search?q=wauzzz8v1ja000001", headers=employee_headers)
        self.assertEqual(order_search_by_vin.status_code, 200, order_search_by_vin.text)
        self.assertEqual(order_search_by_vin.json()[0]["id"], order_id)

        order_search_by_brand = self.client.get("/api/orders/search?q=bmw", headers=employee_headers)
        self.assertEqual(order_search_by_brand.status_code, 200, order_search_by_brand.text)
        self.assertEqual(order_search_by_brand.json()[0]["id"], order_id)

        order_search_by_model = self.client.get("/api/orders/search?q=x5", headers=employee_headers)
        self.assertEqual(order_search_by_model.status_code, 200, order_search_by_model.text)
        self.assertEqual(order_search_by_model.json()[0]["id"], order_id)

        paged_order_search = self.client.get("/api/orders?search=bmw&page=1&page_size=50", headers=employee_headers)
        self.assertEqual(paged_order_search.status_code, 200, paged_order_search.text)
        self.assertTrue(any(item["id"] == order_id for item in paged_order_search.json()["items"]))

        summary_search = self.client.get("/api/orders/summary?search=x5", headers=employee_headers)
        self.assertEqual(summary_search.status_code, 200, summary_search.text)
        self.assertEqual(summary_search.json()["total"], 1)

        by_plate = self.client.get("/api/vehicles/by-plate/A777AA00", headers=employee_headers)
        self.assertEqual(by_plate.status_code, 200, by_plate.text)
        self.assertEqual(by_plate.json()["id"], vehicle_id)

        vehicle_listing = self.client.get("/api/vehicles", headers=employee_headers)
        self.assertEqual(vehicle_listing.status_code, 200, vehicle_listing.text)
        self.assertTrue(any(isinstance(item, dict) and item["id"] == vehicle_id for item in vehicle_listing.json()))

        reassigned = self.client.post(
            f"/api/vehicles/{vehicle_id}/owners",
            json={"client_id": second_client_id},
            headers=employee_headers,
        )
        self.assertEqual(reassigned.status_code, 200, reassigned.text)
        self.assertEqual(reassigned.json()["client_id"], second_client_id)

        updated_order = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": first_client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Still editable after reassignment",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=employee_headers,
        )
        self.assertEqual(updated_order.status_code, 200, updated_order.text)
        self.assertEqual(updated_order.json()["status"], "new")

    def test_vehicle_plate_letters_remain_unique_and_search_supports_brand_and_model(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")

        client_response = self.client.post(
            "/api/clients",
            json={
                "full_name": "Demo Customer 12",
                "phone": "+70000000019",
                "telegram_username": None,
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(client_response.status_code, 201, client_response.text)
        client_id = client_response.json()["id"]

        first_vehicle = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": "У777УУ00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Mazda",
                "model": "CX-5",
                "year": 2022,
                "mileage": 41000,
                "color": "Blue",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(first_vehicle.status_code, 201, first_vehicle.text)
        self.assertEqual(first_vehicle.json()["plate_number_normalized"], "У777УУ00")

        second_vehicle = self.client.post(
            "/api/vehicles",
            json={
                "client_id": client_id,
                "plate_number": "Т777ТТ00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Lada",
                "model": "Vesta",
                "year": 2023,
                "mileage": 18000,
                "color": "White",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(second_vehicle.status_code, 201, second_vehicle.text)
        self.assertEqual(second_vehicle.json()["plate_number_normalized"], "Т777ТТ00")

        by_plate_first = self.client.get("/api/vehicles/by-plate/У777УУ00", headers=headers)
        self.assertEqual(by_plate_first.status_code, 200, by_plate_first.text)
        self.assertEqual(by_plate_first.json()["id"], first_vehicle.json()["id"])

        by_plate_second = self.client.get("/api/vehicles/by-plate/Т777ТТ00", headers=headers)
        self.assertEqual(by_plate_second.status_code, 200, by_plate_second.text)
        self.assertEqual(by_plate_second.json()["id"], second_vehicle.json()["id"])

        brand_search = self.client.get("/api/vehicles/search?q=mazda", headers=headers)
        self.assertEqual(brand_search.status_code, 200, brand_search.text)
        self.assertTrue(any(item["id"] == first_vehicle.json()["id"] for item in brand_search.json()))

        model_search = self.client.get("/api/vehicles/search?q=vesta", headers=headers)
        self.assertEqual(model_search.status_code, 200, model_search.text)
        self.assertTrue(any(item["id"] == second_vehicle.json()["id"] for item in model_search.json()))

    def test_order_status_transitions_through_api(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)

        created = self.client.post(
            "/api/orders",
            json={"client_id": client_id, "vehicle_id": vehicle_id, "status": "new", "comment": None, "discount_value": "0.00", "discount_type": "fixed", "services": []},
            headers=headers,
        )
        order_id = created.json()["id"]

        completed = self.client.patch(f"/api/orders/{order_id}/status", json={"status": "closed", "completed_at": None}, headers=headers)
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["status"], "closed")
        self.assertIsNotNone(completed.json()["completed_at"])
        self.assertTrue(completed.json()["is_archived"])

        reopened = self.client.patch(f"/api/orders/{order_id}/status", json={"status": "new", "completed_at": None}, headers=headers)
        self.assertEqual(reopened.status_code, 200, reopened.text)
        self.assertEqual(reopened.json()["status"], "new")
        self.assertIsNone(reopened.json()["completed_at"])
        self.assertFalse(reopened.json()["is_archived"])

    def test_order_detail_includes_client_and_vehicle_summaries(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)

        created = self.client.post(
            "/api/orders",
            json={"client_id": client_id, "vehicle_id": vehicle_id, "status": "new", "comment": None, "discount_value": "0.00", "discount_type": "fixed", "services": []},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        order_id = created.json()["id"]

        detail = self.client.get(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        payload = detail.json()

        self.assertEqual(payload["client_summary"], {"id": client_id, "full_name": "Demo Customer 03", "phone_display": "+70000000001"})
        self.assertEqual(payload["vehicle_summary"]["id"], vehicle_id)
        self.assertEqual(payload["vehicle_summary"]["client_id"], client_id)
        self.assertEqual(payload["vehicle_summary"]["plate_number_display"], "A777AA00")
        self.assertIn("display_name", payload["vehicle_summary"])
        self.assertEqual(payload["paid_total"], "0.00")
        self.assertEqual(payload["balance_due"], "0.00")
        self.assertEqual(payload["payment_status"], "unpaid")

    def test_document_detail_includes_order_client_and_vehicle_summary(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)

        detail = self.client.get(f"/api/documents/{created.json()['id']}", headers=headers)
        self.assertEqual(detail.status_code, 200, detail.text)
        payload = detail.json()
        self.assertEqual(payload["order_summary"]["id"], order_id)
        self.assertEqual(payload["order_summary"]["client_summary"]["full_name"], "Demo Customer 03")
        self.assertEqual(payload["order_summary"]["vehicle_summary"]["plate_number_display"], "A777AA00")
        self.assertIn("display_name", payload["order_summary"]["vehicle_summary"])

    def test_generic_vehicle_update_does_not_silently_reassign_owner(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        first_client_id, vehicle_id = self.create_client_and_vehicle(headers)

        second_client_response = self.client.post(
            "/api/clients",
            json={"full_name": "Demo Customer 11", "phone": "+70000000002", "telegram_username": None, "comment": None},
            headers=headers,
        )
        self.assertEqual(second_client_response.status_code, 201, second_client_response.text)
        second_client_id = second_client_response.json()["id"]

        update_response = self.client.put(
            f"/api/vehicles/{vehicle_id}",
            json={
                "client_id": second_client_id,
                "plate_number": "A777AA00",
                "vin": None,
                "brand_id": None,
                "model_id": None,
                "brand": "Lada",
                "model": "Vesta",
                "year": 2022,
                "mileage": 54000,
                "color": "Black",
                "comment": None,
            },
            headers=headers,
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        self.assertEqual(update_response.json()["client_id"], second_client_id)
        self.assertEqual(update_response.json()["current_owner_full_name"], "Demo Customer 11")

        vehicle_response = self.client.get(f"/api/vehicles/{vehicle_id}", headers=headers)
        self.assertEqual(vehicle_response.status_code, 200, vehicle_response.text)
        self.assertEqual(vehicle_response.json()["client_id"], second_client_id)
        self.assertEqual(vehicle_response.json()["current_owner_full_name"], "Demo Customer 11")

    def test_admin_can_reset_employee_password(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")

        session = self.SessionLocal()
        try:
            employee_id = session.scalar(select(CrmUser.id).where(CrmUser.login == "employee"))
        finally:
            session.close()

        reset = self.client.patch(
            f"/api/users/{employee_id}/reset-password",
            json={"new_password": "employee-new-pass"},
            headers=admin_headers,
        )
        self.assertEqual(reset.status_code, 200, reset.text)

        login = self.client.post("/api/auth/login", json={"login": "employee", "password": "employee-new-pass"})
        self.assertEqual(login.status_code, 200, login.text)

        legacy_reset = self.client.post(
            f"/api/auth/reset-password/{employee_id}",
            json={"new_password": "legacy-route-should-not-work"},
            headers=admin_headers,
        )
        self.assertEqual(legacy_reset.status_code, 404, legacy_reset.text)

    def test_document_creation_uses_order_number_for_all_types(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        first = self.client.post(
            f"/api/orders/{order_id}/documents/preliminary_work_order",
            headers=headers,
        )
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(first.json()["document_number"], order_id)

        second = self.client.post(
            f"/api/orders/{order_id}/documents/work_order",
            headers=headers,
        )
        self.assertEqual(second.status_code, 201, second.text)
        self.assertEqual(second.json()["document_number"], order_id)

        third = self.client.post(
            f"/api/orders/{order_id}/documents/completion_act",
            headers=headers,
        )
        self.assertEqual(third.status_code, 201, third.text)
        self.assertEqual(third.json()["document_number"], order_id)

    def test_document_creation_rejects_duplicate_type_for_same_order(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        first = self.client.post(
            f"/api/orders/{order_id}/documents/preliminary_work_order",
            headers=headers,
        )
        self.assertEqual(first.status_code, 201, first.text)

        duplicate = self.client.post(
            f"/api/orders/{order_id}/documents/preliminary_work_order",
            headers=headers,
        )
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        self.assertEqual(duplicate.json()["error"]["code"], "document_type_exists")

    def test_document_uses_correct_root_template_by_type(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_template_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertTrue(created.json()["template"]["storage_path"].endswith("Рабочий заказ-наряд шаблон.docx"))

    def test_admin_can_upload_new_document_template_from_settings(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        original_template_path = Path(self.templates_dir.name) / "Заказ наряд шаблон.docx"
        original_template_bytes = original_template_path.read_bytes()

        try:
            listing = self.client.get("/api/settings/document-templates", headers=admin_headers)
            self.assertEqual(listing.status_code, 200, listing.text)
            self.assertEqual(len(listing.json()), 4)

            uploaded = self.client.post(
                "/api/settings/document-templates/completion_act",
                headers=admin_headers,
                files={"file": self.make_test_docx_upload("completion-act-template.docx", "Новый шаблон акта")},
            )
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            self.assertEqual(uploaded.json()["code"], "completion_act")
            self.assertTrue(uploaded.json()["storage_path"].endswith("Заказ наряд шаблон.docx"))
            self.assertTrue(Path(uploaded.json()["storage_path"]).exists())

            order_id = self.create_order_for_documents(employee_headers)
            document = self.client.post(f"/api/orders/{order_id}/documents/completion_act", headers=employee_headers)
            self.assertEqual(document.status_code, 201, document.text)

            rendered = self.client.post(f"/api/documents/{document.json()['id']}/render", headers=employee_headers)
            self.assertEqual(rendered.status_code, 200, rendered.text)

            xml_text = self.read_docx_text(rendered.json()["storage_docx_path"])
            self.assertIn("Новый шаблон акта", xml_text)
        finally:
            original_template_path.write_bytes(original_template_bytes)

    def test_employee_cannot_manage_document_templates_from_settings(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        listing = self.client.get("/api/settings/document-templates", headers=employee_headers)
        self.assertEqual(listing.status_code, 403, listing.text)

        uploaded = self.client.post(
            "/api/settings/document-templates/work_order",
            headers=employee_headers,
            files={"file": self.make_test_docx_upload("work-order-template.docx")},
        )
        self.assertEqual(uploaded.status_code, 403, uploaded.text)

    def test_document_numbering_settings_endpoint_is_removed_without_affecting_order_based_numbering(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(employee_headers)

        current = self.client.get("/api/settings/document-numbering", headers=admin_headers)
        self.assertEqual(current.status_code, 404, current.text)

        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=employee_headers)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["document_number"], order_id)

    def test_document_records_stay_linked_to_order_and_list(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        document_id = created.json()["id"]
        self.assertEqual(created.json()["order_id"], order_id)

        listing = self.client.get(f"/api/orders/{order_id}/documents", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(listing.json()[0]["id"], document_id)

        details = self.client.get(f"/api/documents/{document_id}", headers=headers)
        self.assertEqual(details.status_code, 200, details.text)
        self.assertEqual(details.json()["order_id"], order_id)

    def test_document_rendering_and_download_endpoints_are_consistent(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        document_id = created.json()["id"]
        created_date = datetime.fromisoformat(created.json()["created_at"]).strftime("%d_%m_%Y")
        self.assertFalse(created.json()["docx_file"]["exists"])
        self.assertIsNone(created.json()["storage_docx_path"])
        self.assertEqual(created.json()["work_started_at"][:10], created.json()["created_at"][:10])

        preview = self.client.get(f"/api/documents/{document_id}/preview", headers=headers)
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertIn("Шаблон:", preview.json()["preview_content"])
        self.assertIn("Тип: Рабочий заказ-наряд", preview.json()["preview_content"])
        self.assertEqual(preview.json()["unresolved_placeholders"], [])

        rendered = self.client.post(f"/api/documents/{document_id}/render", headers=headers)
        self.assertEqual(rendered.status_code, 200, rendered.text)
        self.assertTrue(rendered.json()["docx_file"]["exists"])

        generated_pdf = self.client.post(f"/api/documents/{document_id}/generate-pdf", headers=headers)
        self.assertEqual(generated_pdf.status_code, 200, generated_pdf.text)
        self.assertTrue(generated_pdf.json()["pdf_file"]["exists"])
        self.assertTrue(Path(generated_pdf.json()["pdf_file"]["storage_path"]).exists())

        download_headers = {
            **headers,
            "Origin": "http://127.0.0.1:1420",
        }
        docx_download = self.client.get(f"/api/documents/{document_id}/download/docx", headers=download_headers)
        self.assertEqual(docx_download.status_code, 200, docx_download.text)
        self.assertEqual(
            docx_download.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertIn(
            f"filename*=utf-8''%D1%80%D0%B0%D0%B1%D0%BE%D1%87%D0%B8%D0%B9_%D0%B7%D0%B0%D0%BA%D0%B0%D0%B7_%D0%BD%D0%B0%D1%80%D1%8F%D0%B4_%E2%84%96{order_id}_{created_date}.docx",
            docx_download.headers["content-disposition"],
        )
        self.assertGreater(len(docx_download.content), 0)

        pdf_download = self.client.get(f"/api/documents/{document_id}/download/pdf", headers=download_headers)
        self.assertEqual(pdf_download.status_code, 200, pdf_download.text)
        self.assertEqual(pdf_download.headers["content-type"], "application/pdf")
        self.assertIn(
            f"filename*=utf-8''%D1%80%D0%B0%D0%B1%D0%BE%D1%87%D0%B8%D0%B9_%D0%B7%D0%B0%D0%BA%D0%B0%D0%B7_%D0%BD%D0%B0%D1%80%D1%8F%D0%B4_%E2%84%96{order_id}_{created_date}.pdf",
            pdf_download.headers["content-disposition"],
        )
        self.assertGreater(len(pdf_download.content), 0)

        print_payload = self.client.post(f"/api/documents/{document_id}/print", headers=headers)
        self.assertEqual(print_payload.status_code, 200, print_payload.text)
        self.assertTrue(print_payload.json()["print_source"])

    def test_service_only_documents_exclude_material_rows(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_template_documents(headers)

        work_order = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(work_order.status_code, 201, work_order.text)
        rendered_work_order = self.client.post(f"/api/documents/{work_order.json()['id']}/render", headers=headers)
        self.assertEqual(rendered_work_order.status_code, 200, rendered_work_order.text)
        work_order_xml = self.read_docx_text(rendered_work_order.json()["docx_file"]["storage_path"])
        self.assertIn("Полировка кузова", work_order_xml)
        self.assertNotIn("Керамика", work_order_xml)

        completion_act = self.client.post(f"/api/orders/{order_id}/documents/completion_act", headers=headers)
        self.assertEqual(completion_act.status_code, 201, completion_act.text)
        rendered_completion_act = self.client.post(f"/api/documents/{completion_act.json()['id']}/render", headers=headers)
        self.assertEqual(rendered_completion_act.status_code, 200, rendered_completion_act.text)
        completion_xml = self.read_docx_text(rendered_completion_act.json()["docx_file"]["storage_path"])
        self.assertIn("Полировка кузова", completion_xml)
        self.assertNotIn("Керамика", completion_xml)
        self.assertIn("1 000 ₽", completion_xml)

    def test_preliminary_work_order_includes_services_without_material_rows(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_template_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/preliminary_work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        rendered = self.client.post(f"/api/documents/{created.json()['id']}/render", headers=headers)
        self.assertEqual(rendered.status_code, 200, rendered.text)
        xml_text = self.read_docx_text(rendered.json()["docx_file"]["storage_path"])
        self.assertIn("Полировка кузова", xml_text)
        self.assertNotIn("Керамика", xml_text)

    def test_manual_fields_are_not_required_backend_placeholders(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_template_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/preliminary_work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertIn("Блок запчастей остаётся ручным по шаблону", created.json()["manual_fields_by_design"])
        self.assertEqual(created.json()["unresolved_placeholders"], [])

    def test_no_hard_delete_path_for_orders(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)
        created = self.client.post(
            "/api/orders",
            json={"client_id": client_id, "vehicle_id": vehicle_id, "status": "new", "comment": None, "discount_value": "0.00", "discount_type": "fixed", "services": []},
            headers=headers,
        )
        order_id = created.json()["id"]

        delete_response = self.client.delete(f"/api/orders/{order_id}", headers=headers)
        self.assertEqual(delete_response.status_code, 405)

    def test_no_hard_delete_path_for_documents(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)
        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        document_id = created.json()["id"]

        delete_response = self.client.delete(f"/api/documents/{document_id}", headers=headers)
        self.assertEqual(delete_response.status_code, 405)

    def test_legacy_routes_are_not_mounted(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        for path in ("/api/payments", "/api/dashboard", "/api/bot"):
            response = self.client.get(path, headers=headers)
            self.assertEqual(response.status_code, 404, f"{path} should not be mounted")

    def test_full_order_put_is_canonical_edit_contract(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)
        created = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Original",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Wash",
                        "category_name_snapshot": "Care",
                        "unit_price": "1000.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        order_id = created.json()["id"]

        updated = self.client.put(
            f"/api/orders/{order_id}",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Replaced rows",
                "discount_value": "50.00",
                "discount_type": "fixed",
                "services": [
                    {
                        "service_catalog_id": None,
                        "service_name_snapshot": "Polish",
                        "category_name_snapshot": "Care",
                        "unit_price": "1500.00",
                        "quantity": 1,
                        "sort_key": 0,
                    }
                ],
            },
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(len(updated.json()["services"]), 1)
        self.assertEqual(updated.json()["services"][0]["service_name_snapshot"], "Polish")
        self.assertNotIn("materials", updated.json())
        self.assertEqual(updated.json()["amount_to_pay"], "1450.00")

        for path in (
            f"/api/orders/{order_id}/services",
            f"/api/orders/{order_id}/materials",
            f"/api/orders/{order_id}/services/1",
            f"/api/orders/{order_id}/materials/1",
        ):
            response = self.client.post(path, headers=headers) if path.endswith("/services") or path.endswith("/materials") else self.client.put(path, headers=headers)
            self.assertEqual(response.status_code, 404)

    def test_removed_document_numbering_settings_do_not_override_order_numbering(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(employee_headers)
        updated = self.client.put("/api/settings/document-numbering", headers=admin_headers)
        self.assertEqual(updated.status_code, 404, updated.text)

        created = self.client.post(f"/api/orders/{order_id}/documents/preliminary_work_order", headers=employee_headers)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["document_number"], order_id)

    def test_quick_docx_download_creates_or_updates_document_by_order_and_type(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        download_headers = {
            **headers,
            "Origin": "http://127.0.0.1:1420",
        }
        downloaded = self.client.post(
            f"/api/orders/{order_id}/documents/work_order/download/docx",
            headers=download_headers,
        )
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(
            downloaded.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        listing = self.client.get(f"/api/orders/{order_id}/documents", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(listing.json()[0]["document_type"], "work_order")
        self.assertEqual(listing.json()[0]["document_number"], order_id)

    def test_document_created_at_uses_krasnoyarsk_business_time(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        before = app_now_naive()
        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        after = app_now_naive()

        created_at = datetime.fromisoformat(created.json()["created_at"])
        self.assertGreaterEqual(created_at, before - timedelta(minutes=1))
        self.assertLessEqual(created_at, after + timedelta(minutes=1))

    def test_order_pdf_download_creates_document_on_first_request(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        downloaded = self.client.post(
            f"/api/orders/{order_id}/documents/completion_act/download/pdf",
            headers={**headers, "Origin": "http://127.0.0.1:1420"},
        )
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.headers["content-type"], "application/pdf")

        listing = self.client.get(f"/api/orders/{order_id}/documents", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(listing.json()[0]["document_type"], "completion_act")
        self.assertTrue(listing.json()[0]["pdf_file"]["exists"])
        self.assertEqual(listing.json()[0]["last_pdf_engine"], "libreoffice")

    def test_document_work_dates_can_be_updated_independently_from_order(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_template_documents(headers)

        created = self.client.post(f"/api/orders/{order_id}/documents/work_order", headers=headers)
        self.assertEqual(created.status_code, 201, created.text)
        document_id = created.json()["id"]

        updated = self.client.put(
            f"/api/documents/{document_id}/work-dates",
            json={"work_started_at": "2026-03-20T09:30:00", "work_completed_at": "2026-03-24T18:45:00"},
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["work_started_at"], "2026-03-20T09:30:00")
        self.assertEqual(updated.json()["work_completed_at"], "2026-03-24T18:45:00")

        rendered = self.client.post(f"/api/documents/{document_id}/render", headers=headers)
        self.assertEqual(rendered.status_code, 200, rendered.text)
        self.assertTrue(rendered.json()["docx_file"]["exists"])

    def test_notes_are_shared_and_searchable_by_number(self) -> None:
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")

        first = self.client.post("/api/notes", json={"telephone": None, "comment": "Первая заметка"}, headers=employee_headers)
        self.assertEqual(first.status_code, 201, first.text)
        first_id = first.json()["id"]
        self.assertEqual(first.json()["number"], first_id)
        self.assertIsNone(first.json()["telephone"])
        self.assertEqual(first.json()["created_by_user_name"], "Demo Customer 02")

        second = self.client.post(
            "/api/notes",
            json={"telephone": "+70000000001", "comment": "Вторая заметка"},
            headers=admin_headers,
        )
        self.assertEqual(second.status_code, 201, second.text)
        second_id = second.json()["id"]
        self.assertEqual(second.json()["telephone"], "+70000000001")

        listing = self.client.get("/api/notes", headers=employee_headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual([item["id"] for item in listing.json()], [second_id, first_id])

        searched = self.client.get("/api/notes?q=1234567", headers=admin_headers)
        self.assertEqual(searched.status_code, 200, searched.text)
        self.assertEqual(len(searched.json()), 1)
        self.assertEqual(searched.json()[0]["id"], second_id)

    def test_note_can_be_updated_and_deleted(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")

        created = self.client.post(
            "/api/notes",
            json={"telephone": None, "comment": "Черновая заметка"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        note_id = created.json()["id"]

        updated = self.client.put(
            f"/api/notes/{note_id}",
            json={"telephone": "+70000000020", "comment": "Обновлённая заметка"},
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["comment"], "Обновлённая заметка")
        self.assertEqual(updated.json()["telephone"], "+70000000020")

        deleted = self.client.delete(f"/api/notes/{note_id}", headers=headers)
        self.assertEqual(deleted.status_code, 204, deleted.text)

        missing = self.client.get(f"/api/notes/{note_id}", headers=headers)
        self.assertEqual(missing.status_code, 404, missing.text)

    def test_user_preferences_are_saved_per_current_user(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")
        employee_headers = self.auth_headers("employee", "employee-test-pass-2026")

        admin_default = self.client.get("/api/settings/me/preferences", headers=admin_headers)
        self.assertEqual(admin_default.status_code, 200, admin_default.text)
        self.assertEqual(
            admin_default.json()["order_sorting"],
            [
                {"key": "status", "direction": "asc"},
                {"key": "scheduled_for", "direction": "asc"},
                {"key": "id", "direction": "desc"},
            ],
        )

        updated = self.client.put(
            "/api/settings/me/preferences",
            json={
                "order_sorting": [
                    {"key": "vehicle_model", "direction": "asc"},
                    {"key": "amount_to_pay", "direction": "desc"},
                    {"key": "status", "direction": "desc"},
                ]
            },
            headers=admin_headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(
            updated.json()["order_sorting"],
            [
                {"key": "vehicle_model", "direction": "asc"},
                {"key": "amount_to_pay", "direction": "desc"},
                {"key": "status", "direction": "desc"},
            ],
        )

        employee_default = self.client.get("/api/settings/me/preferences", headers=employee_headers)
        self.assertEqual(employee_default.status_code, 200, employee_default.text)
        self.assertEqual(employee_default.json()["order_sorting"][0], {"key": "status", "direction": "asc"})

        duplicate_key = self.client.put(
            "/api/settings/me/preferences",
            json={
                "order_sorting": [
                    {"key": "status", "direction": "asc"},
                    {"key": "status", "direction": "desc"},
                ]
            },
            headers=admin_headers,
        )
        self.assertEqual(duplicate_key.status_code, 422, duplicate_key.text)

    def test_admin_can_view_settings_vehicle_catalog_status_and_run_sync(self) -> None:
        admin_headers = self.auth_headers("admin", "admin-test-pass-2026")

        status = self.client.get("/api/settings/vehicle-catalog", headers=admin_headers)
        self.assertEqual(status.status_code, 200, status.text)
        self.assertIn("brand_count", status.json())
        self.assertIn("model_count", status.json())
        self.assertIn("provider", status.json())

        with patch(
            "app.crm.services.settings_service.VehicleCatalogSyncService.sync",
            return_value=type(
                "FakeSyncResult",
                (),
                {
                    "as_dict": lambda self: {
                        "provider": "fake_provider",
                        "mode": "merge",
                        "dry_run": False,
                        "started_at": "2026-03-23T10:00:00+00:00",
                        "completed_at": "2026-03-23T10:00:05+00:00",
                        "brands_added": 2,
                        "brands_updated": 0,
                        "brands_skipped": 0,
                        "brands_deleted": 0,
                        "models_added": 5,
                        "models_updated": 0,
                        "models_skipped": 0,
                        "models_deleted": 0,
                        "vehicles_detached": 0,
                        "fetch_errors": 0,
                        "processed_brand_count": 2,
                        "processed_model_count": 5,
                    }
                },
            )(),
        ):
            synced = self.client.post("/api/settings/vehicle-catalog/sync", headers=admin_headers)

        self.assertEqual(synced.status_code, 200, synced.text)
        self.assertEqual(synced.json()["provider"], "fake_provider")
        self.assertEqual(synced.json()["brands_added"], 2)
        self.assertEqual(synced.json()["models_added"], 5)

    def test_create_client_reminder_and_list_by_target(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)

        created = self.create_client_reminder(headers, client_id, text="Call about estimate")
        self.assertEqual(created["target_type"], "client")
        self.assertEqual(created["target_id"], client_id)
        self.assertEqual(created["effective_status"], "overdue")
        self.assertEqual(created["target_summary"]["title"], "Demo Customer 03")

        listing = self.client.get(f"/api/clients/{client_id}/reminders", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(listing.json()[0]["id"], created["id"])

    def test_create_order_reminder_and_get_details(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, vehicle_id = self.create_client_and_vehicle(headers)
        order_response = self.client.post(
            "/api/orders",
            json={
                "client_id": client_id,
                "vehicle_id": vehicle_id,
                "status": "new",
                "comment": "Needs follow-up",
                "discount_value": "0.00",
                "discount_type": "fixed",
                "services": [],
            },
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 201, order_response.text)
        order_id = order_response.json()["id"]

        created = self.create_order_reminder(headers, order_id, text="Confirm pickup")
        details = self.client.get(f"/api/reminders/{created['id']}", headers=headers)
        self.assertEqual(details.status_code, 200, details.text)
        self.assertEqual(details.json()["target_type"], "order")
        self.assertEqual(details.json()["target_summary"]["target_id"], order_id)
        self.assertIn("A777AA00", details.json()["target_summary"]["subtitle"])

    def test_active_notifications_include_due_reminders(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(headers, client_id)

        notifications = self.client.get("/api/notifications", headers=headers)
        self.assertEqual(notifications.status_code, 200, notifications.text)
        self.assertTrue(any(item["reminder_id"] == reminder["id"] for item in notifications.json()))

    def test_notifications_summary_reports_scope_counts(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(headers, client_id)

        summary = self.client.get("/api/notifications/summary", headers=headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        payload = summary.json()
        self.assertEqual(payload["due"], 1)
        self.assertEqual(payload["scheduled"], 0)
        self.assertEqual(payload["history"], 0)
        self.assertEqual(payload["all"], 1)

    def test_done_reminders_leave_active_feed_and_remain_in_history(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(headers, client_id)

        marked = self.client.patch(f"/api/reminders/{reminder['id']}/done", json={"completed_at": None}, headers=headers)
        self.assertEqual(marked.status_code, 200, marked.text)
        self.assertEqual(marked.json()["status"], "done")

        active = self.client.get("/api/notifications", headers=headers)
        self.assertEqual(active.status_code, 200, active.text)
        self.assertFalse(any(item["reminder_id"] == reminder["id"] for item in active.json()))

        history = self.client.get("/api/notifications/history", headers=headers)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertTrue(any(item["reminder_id"] == reminder["id"] for item in history.json()))

    def test_postpone_changes_due_behavior(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(headers, client_id)
        future_due = (datetime.now(UTC) + timedelta(days=2)).isoformat()

        postponed = self.client.patch(
            f"/api/reminders/{reminder['id']}/postpone",
            json={"postpone_until": future_due},
            headers=headers,
        )
        self.assertEqual(postponed.status_code, 200, postponed.text)
        self.assertEqual(postponed.json()["status"], "postponed")
        self.assertEqual(postponed.json()["effective_status"], "postponed")
        self.assertFalse(postponed.json()["is_overdue"])

        notifications = self.client.get("/api/notifications", headers=headers)
        self.assertEqual(notifications.status_code, 200, notifications.text)
        self.assertFalse(any(item["reminder_id"] == reminder["id"] for item in notifications.json()))

    def test_repeat_update_behaves_consistently(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(headers, client_id)

        updated = self.client.patch(
            f"/api/reminders/{reminder['id']}/repeat",
            json={"repeat_rule": "weekly"},
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["repeat_rule"], "weekly")

    def test_invalid_reminder_target_is_rejected(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")

        client_response = self.client.post(
            "/api/clients/999/reminders",
            json={"text": "No client", "due_at": datetime.now(UTC).isoformat(), "repeat_rule": None},
            headers=headers,
        )
        self.assertEqual(client_response.status_code, 404, client_response.text)

        order_response = self.client.post(
            "/api/orders/999/reminders",
            json={"text": "No order", "due_at": datetime.now(UTC).isoformat(), "repeat_rule": None},
            headers=headers,
        )
        self.assertEqual(order_response.status_code, 404, order_response.text)

    def test_history_includes_done_reminders_without_retention_cutoff(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        recent = self.create_client_reminder(headers, client_id, text="Recent history")
        stale = self.create_client_reminder(headers, client_id, text="Stale history")

        for reminder_id in (recent["id"], stale["id"]):
            done = self.client.patch(f"/api/reminders/{reminder_id}/done", json={"completed_at": None}, headers=headers)
            self.assertEqual(done.status_code, 200, done.text)

        session = self.SessionLocal()
        try:
            stale_reminder = session.get(CrmReminder, stale["id"])
            self.assertIsNotNone(stale_reminder)
            stale_reminder.completed_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=31)
            stale_reminder.status = ReminderStatus.DONE
            session.commit()
        finally:
            session.close()

        history = self.client.get("/api/notifications/history", headers=headers)
        self.assertEqual(history.status_code, 200, history.text)
        history_ids = {item["reminder_id"] for item in history.json()}
        self.assertIn(recent["id"], history_ids)
        self.assertIn(stale["id"], history_ids)

    def test_reminder_soft_delete_moves_item_out_of_active_lists(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(headers, client_id)

        delete_response = self.client.delete(f"/api/reminders/{reminder['id']}", headers=headers)
        self.assertEqual(delete_response.status_code, 204, delete_response.text)

        active_response = self.client.get("/api/notifications?scope=due", headers=headers)
        self.assertEqual(active_response.status_code, 200, active_response.text)
        self.assertFalse(any(item["reminder_id"] == reminder["id"] for item in active_response.json()))

        details_response = self.client.get(f"/api/reminders/{reminder['id']}", headers=headers)
        self.assertEqual(details_response.status_code, 404, details_response.text)

        history_response = self.client.get("/api/notifications?scope=history", headers=headers)
        self.assertEqual(history_response.status_code, 200, history_response.text)
        self.assertFalse(any(item["reminder_id"] == reminder["id"] for item in history_response.json()))

    def test_future_reminder_is_visible_in_scheduled_scope(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        reminder = self.create_client_reminder(
            headers,
            client_id,
            text="Scheduled reminder",
            due_at=(datetime.now(UTC) + timedelta(days=2)).isoformat(),
        )

        scheduled_response = self.client.get("/api/notifications?scope=scheduled", headers=headers)
        self.assertEqual(scheduled_response.status_code, 200, scheduled_response.text)
        self.assertTrue(any(item["reminder_id"] == reminder["id"] for item in scheduled_response.json()))

    def test_local_naive_past_reminder_is_not_left_in_scheduled_scope(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        client_id, _ = self.create_client_and_vehicle(headers)
        local_past_due = (datetime.now() - timedelta(hours=1)).replace(second=0, microsecond=0).isoformat()

        reminder = self.create_client_reminder(
            headers,
            client_id,
            text="Local naive due reminder",
            due_at=local_past_due,
        )

        due_response = self.client.get("/api/notifications?scope=due", headers=headers)
        self.assertEqual(due_response.status_code, 200, due_response.text)
        self.assertTrue(any(item["reminder_id"] == reminder["id"] for item in due_response.json()))

        scheduled_response = self.client.get("/api/notifications?scope=scheduled", headers=headers)
        self.assertEqual(scheduled_response.status_code, 200, scheduled_response.text)
        self.assertFalse(any(item["reminder_id"] == reminder["id"] for item in scheduled_response.json()))

    def test_standalone_reminder_can_be_created_without_order(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        response = self.client.post(
            "/api/reminders",
            json={
                "text": "Standalone reminder",
                "due_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
                "repeat_rule": None,
                "target_type": "standalone",
                "target_id": None,
            },
            headers=headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["target_type"], "standalone")
        self.assertEqual(data["target_id"], 0)

    def test_login_failure(self) -> None:
        response = self.client.post("/api/auth/login", json={"login": "admin", "password": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "auth_failed")

    def test_order_pdf_download_creates_document_on_first_request(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_documents(headers)

        downloaded = self.client.post(
            f"/api/orders/{order_id}/documents/completion_act/download/pdf",
            headers={**headers, "Origin": "http://127.0.0.1:1420"},
        )
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.headers["content-type"], "application/pdf")

        listing = self.client.get(f"/api/orders/{order_id}/documents", headers=headers)
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(listing.json()[0]["document_type"], "completion_act")
        self.assertTrue(listing.json()[0]["pdf_file"]["exists"])
        self.assertEqual(listing.json()[0]["last_pdf_engine"], "libreoffice")

    def test_inspection_photo_file_endpoints_require_nested_access_and_auth(self) -> None:
        headers = self.auth_headers("employee", "employee-test-pass-2026")
        order_id = self.create_order_for_inspection(headers)

        session_response = self.client.post(f"/api/orders/{order_id}/inspection-sessions/start", headers=headers)
        self.assertEqual(session_response.status_code, 201, session_response.text)
        session_id = session_response.json()["id"]

        create_mark_response = self.client.post(
            f"/api/inspection-sessions/{session_id}/marks",
            json={
                "view_type": "front",
                "zone_key": None,
                "geometry_type": "point",
                "geometry_data": {"points": [{"x": 0.25, "y": 0.35}]},
                "defect_type": "scratch",
                "severity": "medium",
                "status": "existing_before_work",
                "comment": "Первичная отметка",
            },
            headers=headers,
        )
        self.assertEqual(create_mark_response.status_code, 201, create_mark_response.text)
        mark_id = create_mark_response.json()["id"]

        upload_mark_photo = self.client.post(
            f"/api/inspection-marks/{mark_id}/photos",
            headers=headers,
            files=[("files", self.make_test_image_upload("mark.jpg"))],
        )
        self.assertEqual(upload_mark_photo.status_code, 201, upload_mark_photo.text)

        upload_general_photo = self.client.post(
            f"/api/inspection-sessions/{session_id}/general-photos",
            headers=headers,
            files=[("files", self.make_test_image_upload("general.jpg"))],
        )
        self.assertEqual(upload_general_photo.status_code, 201, upload_general_photo.text)

        current_session = self.client.get(f"/api/orders/{order_id}/inspection-sessions/current", headers=headers)
        self.assertEqual(current_session.status_code, 200, current_session.text)
        session_payload = current_session.json()
        mark_photo_id = session_payload["marks"][0]["photos"][0]["id"]
        general_photo_id = session_payload["general_photos"][0]["id"]

        unauthenticated_mark = self.client.get(
            f"/api/inspection-sessions/{session_id}/marks/{mark_id}/photos/{mark_photo_id}/file"
        )
        self.assertEqual(unauthenticated_mark.status_code, 401, unauthenticated_mark.text)

        nested_mark = self.client.get(
            f"/api/inspection-sessions/{session_id}/marks/{mark_id}/photos/{mark_photo_id}/file",
            headers=headers,
        )
        self.assertEqual(nested_mark.status_code, 200, nested_mark.text)
        self.assertEqual(nested_mark.headers["content-type"], "image/jpeg")

        wrong_mark = self.client.get(
            f"/api/inspection-sessions/{session_id}/marks/{mark_id + 999}/photos/{mark_photo_id}/file",
            headers=headers,
        )
        self.assertEqual(wrong_mark.status_code, 404, wrong_mark.text)

        old_direct_route = self.client.get(f"/api/inspection-mark-photos/{mark_photo_id}/file", headers=headers)
        self.assertEqual(old_direct_route.status_code, 404, old_direct_route.text)

        nested_general = self.client.get(
            f"/api/inspection-sessions/{session_id}/general-photos/{general_photo_id}/file",
            headers=headers,
        )
        self.assertEqual(nested_general.status_code, 200, nested_general.text)
        self.assertEqual(nested_general.headers["content-type"], "image/jpeg")

    def test_inspection_act_snapshot_remains_immutable_after_reopen_and_regenerate(self) -> None:
        headers = self.auth_headers("admin", "admin-test-pass-2026")
        order_id = self.create_order_for_inspection(headers)

        start_response = self.client.post(f"/api/orders/{order_id}/inspection-sessions/start", headers=headers)
        self.assertEqual(start_response.status_code, 201, start_response.text)
        session_id = start_response.json()["id"]

        create_mark_response = self.client.post(
            f"/api/inspection-sessions/{session_id}/marks",
            json={
                "view_type": "front",
                "zone_key": None,
                "geometry_type": "point",
                "geometry_data": {"points": [{"x": 0.2, "y": 0.3}]},
                "defect_type": "scratch",
                "severity": "medium",
                "status": "existing_before_work",
                "comment": "Старый комментарий осмотра",
            },
            headers=headers,
        )
        self.assertEqual(create_mark_response.status_code, 201, create_mark_response.text)
        mark_id = create_mark_response.json()["id"]

        mark_photo_response = self.client.post(
            f"/api/inspection-marks/{mark_id}/photos",
            headers=headers,
            files=[("files", self.make_test_image_upload("mark.jpg"))],
        )
        self.assertEqual(mark_photo_response.status_code, 201, mark_photo_response.text)

        general_photo_response = self.client.post(
            f"/api/inspection-sessions/{session_id}/general-photos",
            headers=headers,
            files=[("files", self.make_test_image_upload("general.jpg"))],
        )
        self.assertEqual(general_photo_response.status_code, 201, general_photo_response.text)

        complete_response = self.client.post(f"/api/inspection-sessions/{session_id}/complete", headers=headers)
        self.assertEqual(complete_response.status_code, 200, complete_response.text)

        first_generate = self.client.post(f"/api/inspection-sessions/{session_id}/generate-act", headers=headers)
        self.assertEqual(first_generate.status_code, 200, first_generate.text)
        first_document = first_generate.json()["document"]
        first_docx_path = first_document["storage_docx_path"]
        self.assertIsNotNone(first_docx_path)
        first_docx_text_before = self.read_docx_text(first_docx_path)
        self.assertIn("Старый комментарий осмотра", first_docx_text_before)

        reopen_response = self.client.post(f"/api/inspection-sessions/{session_id}/reopen", headers=headers)
        self.assertEqual(reopen_response.status_code, 200, reopen_response.text)

        update_mark_response = self.client.patch(
            f"/api/inspection-marks/{mark_id}",
            json={
                "geometry_type": "point",
                "geometry_data": {"points": [{"x": 0.62, "y": 0.44}]},
                "comment": "Новый комментарий после переоткрытия",
            },
            headers=headers,
        )
        self.assertEqual(update_mark_response.status_code, 200, update_mark_response.text)

        complete_again = self.client.post(f"/api/inspection-sessions/{session_id}/complete", headers=headers)
        self.assertEqual(complete_again.status_code, 200, complete_again.text)

        second_generate = self.client.post(f"/api/inspection-sessions/{session_id}/generate-act", headers=headers)
        self.assertEqual(second_generate.status_code, 200, second_generate.text)
        second_document = second_generate.json()["document"]

        self.assertNotEqual(first_document["id"], second_document["id"])
        self.assertEqual(first_document["document_number"], order_id)
        self.assertEqual(second_document["document_number"], order_id)

        first_docx_text_after = self.read_docx_text(first_docx_path)
        self.assertEqual(first_docx_text_before, first_docx_text_after)
        self.assertIn("Старый комментарий осмотра", first_docx_text_after)
        self.assertNotIn("Новый комментарий после переоткрытия", first_docx_text_after)

        second_docx_text = self.read_docx_text(second_document["storage_docx_path"])
        self.assertIn("Новый комментарий после переоткрытия", second_docx_text)
        self.assertNotIn("Старый комментарий осмотра", second_docx_text)


if __name__ == "__main__":
    unittest.main()
