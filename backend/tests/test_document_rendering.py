from __future__ import annotations

import re
import sys
import unittest
import zipfile
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from types import SimpleNamespace
from unittest.mock import patch
from xml.etree import ElementTree as ET

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import AppError  # noqa: E402
from app.crm.models.document_template import DocumentType  # noqa: E402
from app.crm.services.document_mapping_service import DocumentMappingService  # noqa: E402
from app.crm.services.document_pdf_converter_service import DocumentPdfConverterService  # noqa: E402
from app.crm.services.document_renderer_service import DocumentRendererService  # noqa: E402
from app.crm.services.document_storage_service import DocumentStorageService  # noqa: E402


class DocumentRenderingTestCase(unittest.TestCase):
    def make_client(self, *, client_type: str, full_name: str, phone: str, company_name: str | None = None):
        return SimpleNamespace(
            client_type=client_type,
            full_name=full_name,
            phone_display=phone,
            address="Example Street 02, Example City" if client_type == "individual" else None,
            company_name=company_name,
            inn="7701234567" if client_type == "legal" else None,
            kpp="770101001" if client_type == "legal" else None,
            ogrn="1027700132195" if client_type == "legal" else None,
            legal_address="Example Street 03, Example City" if client_type == "legal" else None,
            actual_address="Example Street 04, Example City" if client_type == "legal" else None,
            representative_full_name="Тестовый Клиент 01" if client_type == "legal" else None,
            representative_position="Директор" if client_type == "legal" else None,
            representative_basis="Устав" if client_type == "legal" else None,
            display_label=company_name if client_type == "legal" and company_name else full_name,
            is_individual=client_type == "individual",
            is_legal=client_type == "legal",
        )

    def make_order_document(
        self,
        *,
        document_type: DocumentType,
        client_type: str = "individual",
        payer_type: str | None = None,
        services: list[SimpleNamespace] | None = None,
    ):
        client = self.make_client(
            client_type=client_type,
            full_name="Тестовый Клиент 02" if client_type == "individual" else "Контакт клиента",
            phone="+70000000001",
            company_name="ООО Клиент" if client_type == "legal" else None,
        )
        payer = (
            self.make_client(
                client_type=payer_type,
                full_name="Плательщик ФЛ" if payer_type == "individual" else "Контакт плательщика",
                phone="+70000000020",
                company_name="ООО Плательщик" if payer_type == "legal" else None,
            )
            if payer_type
            else None
        )
        owner = self.make_client(client_type="individual", full_name="Тестовый Клиент 03", phone="+70000000024")
        vehicle = SimpleNamespace(
            brand="Toyota",
            model="Camry",
            vin="VIN1234567890",
            plate_number_display="А123АА00",
            year=2021,
            mileage=12500,
            color="Белый",
            owner_history=[SimpleNamespace(owned_to=None, client=owner)],
            client=owner,
        )
        rows = services or [
            SimpleNamespace(
                service_name_snapshot="Полировка кузова",
                category_name_snapshot="Детейлинг",
                quantity=1,
                unit_price=Decimal("1000.00"),
                row_total=Decimal("1000.00"),
            ),
            SimpleNamespace(
                service_name_snapshot="Химчистка салона",
                category_name_snapshot="Интерьер",
                quantity=2,
                unit_price=Decimal("1500.00"),
                row_total=Decimal("3000.00"),
            ),
        ]
        order = SimpleNamespace(
            created_at=datetime(2026, 3, 22, 10, 30),
            completed_at=datetime(2026, 3, 22, 18, 15),
            handover_at=datetime(2026, 3, 23, 12, 45),
            due_date=datetime(2026, 3, 24, 9, 0),
            amount_to_pay=Decimal("3500.00"),
            services_total=Decimal("4000.00"),
            discount_value=Decimal("500.00"),
            discount_type="fixed",
            comment="Причина обращения клиента",
            services=rows,
            client=client,
            payer_client=payer,
            vehicle=vehicle,
            field_values=[],
        )
        return SimpleNamespace(
            id=77,
            document_type=document_type,
            document_number=77,
            work_started_at=None,
            work_completed_at=None,
            created_at=datetime(2026, 3, 22, 10, 30),
            template=SimpleNamespace(name="Тестовый шаблон"),
            order=order,
        )

    def make_docx(self, document_xml: str, *, footer_xml: str | None = None) -> bytes:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "[Content_Types].xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
                </Types>""",
            )
            archive.writestr(
                "_rels/.rels",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                </Relationships>""",
            )
            archive.writestr("word/document.xml", document_xml)
            if footer_xml is not None:
                archive.writestr("word/footer1.xml", footer_xml)
        return buffer.getvalue()

    def test_storage_service_uses_canonical_template_filenames(self) -> None:
        service = DocumentStorageService()
        self.assertEqual(service.ROOT_TEMPLATE_FILES[DocumentType.PRELIMINARY_WORK_ORDER], "ПредварительныйЗаказНаряд шаблон.docx")
        self.assertEqual(service.ROOT_TEMPLATE_FILES[DocumentType.WORK_ORDER], "Рабочий заказ-наряд шаблон.docx")
        self.assertEqual(service.ROOT_TEMPLATE_FILES[DocumentType.COMPLETION_ACT], "Заказ наряд шаблон.docx")
        self.assertEqual(service.ROOT_TEMPLATE_FILES[DocumentType.INSPECTION_ACT], "Акт приёма передачи авто шаблон.docx")

    def test_document_mapping_fills_core_context(self) -> None:
        bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.COMPLETION_ACT, client_type="legal", payer_type="individual"),
            [],
        )

        self.assertEqual(bundle.common_replacements["doc.no"], "77")
        self.assertRegex(bundle.common_replacements["doc.date"], r"^\d{2}\.\d{2}\.\d{4}$")
        self.assertEqual(bundle.common_replacements["client.org_name"], "ООО Клиент")
        self.assertEqual(bundle.common_replacements["payer.name"], "Плательщик ФЛ")
        self.assertEqual(bundle.common_replacements["contact.name"], "Контакт клиента")
        self.assertEqual(bundle.common_replacements["contact.phone"], "+70000000001")
        self.assertEqual(bundle.common_replacements["owner.name"], "Тестовый Клиент 03")
        self.assertEqual(bundle.common_replacements["car.color"], "Белый")
        self.assertEqual(bundle.common_replacements["order.reason"], "Причина обращения клиента")
        self.assertEqual(bundle.common_replacements["total"], "4 000 ₽")
        self.assertEqual(bundle.common_replacements["disc"], "500 ₽")
        self.assertEqual(bundle.common_replacements["pay"], "3 500 ₽")

    def test_service_row_loop_renders_two_rows_and_removes_markers(self) -> None:
        renderer = DocumentRendererService()
        document = self.make_order_document(document_type=DocumentType.WORK_ORDER)
        bundle = DocumentMappingService().build_bundle(document, ["srv.name", "srv.cat", "srv.qty", "srv.comment"])
        template = self.make_docx(
            """<?xml version="1.0" encoding="UTF-8"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>{{srv.name}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.cat}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.qty}}</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>{{srv.comment}}</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
              </w:body>
            </w:document>"""
        )

        with NamedTemporaryFile(suffix=".docx", delete=False) as handle:
            path = Path(handle.name)
            path.write_bytes(template)
        try:
            rendered = renderer.render_docx_bytes(path, bundle)
        finally:
            path.unlink(missing_ok=True)

        with zipfile.ZipFile(BytesIO(rendered)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8")

        self.assertIn("Полировка кузова", xml)
        self.assertIn("Химчистка салона", xml)
        self.assertNotIn("{{srv.name}}", xml)

    def test_completion_act_conditionals_cover_all_party_combinations(self) -> None:
        renderer = DocumentRendererService()
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>{{#client.individual}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>CLIENT-IND {{client.name}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{/client.individual}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{#client.legal}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>CLIENT-LEGAL {{client.org_name}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{/client.legal}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{#payer.individual}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>PAYER-IND {{payer.name}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{/payer.individual}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{#payer.legal}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>PAYER-LEGAL {{payer.org_name}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{/payer.legal}}</w:t></w:r></w:p>
          </w:body>
        </w:document>"""
        scenarios = [
            ("individual", "individual", "CLIENT-IND", "PAYER-IND", "CLIENT-LEGAL", "PAYER-LEGAL"),
            ("legal", "legal", "CLIENT-LEGAL", "PAYER-LEGAL", "CLIENT-IND", "PAYER-IND"),
            ("individual", "legal", "CLIENT-IND", "PAYER-LEGAL", "CLIENT-LEGAL", "PAYER-IND"),
            ("legal", "individual", "CLIENT-LEGAL", "PAYER-IND", "CLIENT-IND", "PAYER-LEGAL"),
        ]

        for client_type, payer_type, expected_client, expected_payer, removed_client, removed_payer in scenarios:
            bundle = DocumentMappingService().build_bundle(
                self.make_order_document(
                    document_type=DocumentType.COMPLETION_ACT,
                    client_type=client_type,
                    payer_type=payer_type,
                ),
                ["#client.individual", "/client.individual", "#client.legal", "/client.legal", "#payer.individual", "/payer.individual", "#payer.legal", "/payer.legal"],
            )
            rendered = renderer._render_document_xml(xml, bundle)
            self.assertIn(expected_client, rendered)
            self.assertIn(expected_payer, rendered)
            self.assertNotIn(removed_client, rendered)
            self.assertNotIn(removed_payer, rendered)
            self.assertNotIn("{{#client.individual}}", rendered)
            self.assertNotIn("{{/payer.legal}}", rendered)

    def test_preliminary_inline_legal_text_is_removed_for_individual_and_kept_for_legal(self) -> None:
        renderer = DocumentRendererService()
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>{{#client.legal}}LEGAL-TEXT{{/client.legal}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>STATIC-SPARE-PARTS-BLOCK</w:t></w:r></w:p>
          </w:body>
        </w:document>"""
        legal_bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.PRELIMINARY_WORK_ORDER, client_type="legal"),
            ["#client.legal", "/client.legal"],
        )
        individual_bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.PRELIMINARY_WORK_ORDER, client_type="individual"),
            ["#client.legal", "/client.legal"],
        )

        legal_rendered = renderer._render_document_xml(xml, legal_bundle)
        individual_rendered = renderer._render_document_xml(xml, individual_bundle)

        self.assertIn("LEGAL-TEXT", legal_rendered)
        self.assertNotIn("LEGAL-TEXT", individual_rendered)
        self.assertIn("STATIC-SPARE-PARTS-BLOCK", individual_rendered)

    def test_work_order_and_inspection_contexts_render_without_money_or_snapshot_fields(self) -> None:
        work_bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.WORK_ORDER),
            [],
        )
        inspection_bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.INSPECTION_ACT),
            [],
        )

        self.assertEqual(work_bundle.common_replacements["services.count"], "2")
        self.assertEqual(work_bundle.common_replacements["order.repair_type"], "Детейлинг, Интерьер")
        self.assertEqual(work_bundle.service_rows[0]["srv.cat"], "Детейлинг")
        self.assertEqual(work_bundle.service_rows[0]["srv.comment"], "")
        self.assertEqual(inspection_bundle.common_replacements["car.color"], "Белый")

    def test_preliminary_contact_defaults_to_client(self) -> None:
        bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.PRELIMINARY_WORK_ORDER, client_type="individual"),
            [],
        )

        self.assertEqual(bundle.common_replacements["contact.name"], "Тестовый Клиент 02")
        self.assertEqual(bundle.common_replacements["contact.phone"], "+70000000001")

    def test_renderer_replaces_placeholders_in_footer_xml(self) -> None:
        renderer = DocumentRendererService()
        bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.WORK_ORDER),
            [],
        )
        template = self.make_docx(
            """<?xml version="1.0" encoding="UTF-8"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:body>
            </w:document>""",
            footer_xml="""<?xml version="1.0" encoding="UTF-8"?>
            <w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:p><w:r><w:t>{{doc.no}} / {{doc.date}}</w:t></w:r></w:p>
            </w:ftr>""",
        )

        with NamedTemporaryFile(suffix=".docx", delete=False) as handle:
            path = Path(handle.name)
            path.write_bytes(template)
        try:
            rendered = renderer.render_docx_bytes(path, bundle)
        finally:
            path.unlink(missing_ok=True)

        with zipfile.ZipFile(BytesIO(rendered)) as archive:
            footer_xml = archive.read("word/footer1.xml").decode("utf-8")

        self.assertIn("77 / ", footer_xml)
        self.assertNotIn("{{doc.no}}", footer_xml)
        self.assertNotIn("{{doc.date}}", footer_xml)

    def test_rendered_docx_is_valid_zip(self) -> None:
        renderer = DocumentRendererService()
        bundle = DocumentMappingService().build_bundle(
            self.make_order_document(document_type=DocumentType.COMPLETION_ACT),
            [],
        )
        template = self.make_docx(
            """<?xml version="1.0" encoding="UTF-8"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body><w:p><w:r><w:t>{{doc.no}}</w:t></w:r></w:p></w:body>
            </w:document>"""
        )

        with NamedTemporaryFile(suffix=".docx", delete=False) as handle:
            path = Path(handle.name)
            path.write_bytes(template)
        try:
            rendered = renderer.render_docx_bytes(path, bundle)
        finally:
            path.unlink(missing_ok=True)

        with zipfile.ZipFile(BytesIO(rendered)) as archive:
            self.assertIn("word/document.xml", archive.namelist())

    def test_pdf_converter_raises_controlled_error_when_libreoffice_is_unavailable(self) -> None:
        converter = DocumentPdfConverterService()
        bundle = SimpleNamespace(preview_content="Line 1\nLine 2")

        with NamedTemporaryFile(suffix=".docx", delete=False) as docx_handle:
            docx_path = Path(docx_handle.name)
        with NamedTemporaryFile(suffix=".pdf", delete=False) as pdf_handle:
            pdf_path = Path(pdf_handle.name)

        try:
            pdf_path.unlink(missing_ok=True)
            with patch.object(converter.settings, "libreoffice_executable_path", ""), patch(
                "app.crm.services.document_pdf_converter_service.shutil.which", return_value=None
            ), patch("app.crm.services.document_pdf_converter_service.subprocess.run") as run_mock:
                with self.assertRaises(AppError) as exc_info:
                    converter.convert(docx_path, pdf_path, bundle)

            self.assertEqual(exc_info.exception.code, "pdf_conversion_failed")
            self.assertFalse(run_mock.called)
            self.assertFalse(pdf_path.exists())
        finally:
            docx_path.unlink(missing_ok=True)
            pdf_path.unlink(missing_ok=True)

    def test_pdf_converter_uses_libreoffice_when_available(self) -> None:
        converter = DocumentPdfConverterService()
        bundle = SimpleNamespace(preview_content="unused fallback")

        with NamedTemporaryFile(suffix=".docx", delete=False) as docx_handle:
            docx_path = Path(docx_handle.name)
        with NamedTemporaryFile(suffix=".pdf", delete=False) as pdf_handle:
            pdf_path = Path(pdf_handle.name)

        try:
            pdf_path.unlink(missing_ok=True)

            def fake_run(*args, **kwargs):
                generated_pdf = pdf_path.parent / f"{docx_path.stem}.pdf"
                generated_pdf.write_bytes(b"%PDF-1.4 fake libreoffice output")
                return SimpleNamespace(returncode=0, stderr="", stdout="")

            with patch("app.crm.services.document_pdf_converter_service.shutil.which", side_effect=["soffice", None]), patch(
                "app.crm.services.document_pdf_converter_service.subprocess.run",
                side_effect=fake_run,
            ) as run_mock:
                backend = converter.convert(docx_path, pdf_path, bundle)

            self.assertEqual(backend.engine, "libreoffice")
            self.assertIsNone(backend.note)
            self.assertTrue(run_mock.called)
            self.assertTrue(pdf_path.exists())
            self.assertEqual(pdf_path.read_bytes(), b"%PDF-1.4 fake libreoffice output")
        finally:
            docx_path.unlink(missing_ok=True)
            pdf_path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
