from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.core.errors import AppError
from app.core.time import app_now_naive
from app.crm.models.document import CrmDocument
from app.crm.models.document_template import DocumentType
from app.crm.services.order_calculation_service import OrderCalculationService


PLACEHOLDER_RE = re.compile(r"\{\{(.*?)\}\}", re.S)
ZERO_MONEY = Decimal("0.00")


@dataclass
class TemplateRenderBundle:
    template_placeholders: list[str]
    unresolved_placeholders: list[str]
    manual_placeholders: list[str]
    manual_fields_by_design: list[str]
    common_replacements: dict[str, str]
    service_rows: list[dict[str, str]]
    material_rows: list[dict[str, str]]
    preview_content: str
    section_flags: dict[str, bool]


class DocumentMappingService:
    OPTIONAL_PLACEHOLDERS = {
        "client.address",
        "client.actual_addr",
        "client.inn",
        "client.kpp",
        "client.legal_addr",
        "client.ogrn",
        "client.org_name",
        "client.rep_basis",
        "client.rep_name",
        "client.rep_position",
        "payer.address",
        "payer.actual_addr",
        "payer.inn",
        "payer.kpp",
        "payer.legal_addr",
        "payer.ogrn",
        "payer.org_name",
        "payer.rep_basis",
        "payer.rep_name",
        "payer.rep_position",
        "contact.name",
        "contact.phone",
        "order.pay_method",
        "order.ready_at",
        "order.repair_type",
        "srv.comment",
        "car.color",
        "car.vin",
        "car.year",
        "car.mileage",
    }

    MANUAL_FIELDS_BY_TYPE = {
        DocumentType.PRELIMINARY_WORK_ORDER: ["Блок запчастей остаётся ручным по шаблону"],
        DocumentType.WORK_ORDER: [],
        DocumentType.COMPLETION_ACT: [],
        DocumentType.INSPECTION_ACT: ["Ручные поля осмотра и подписи остаются в шаблоне"],
    }

    DOCUMENT_TYPE_LABELS = {
        DocumentType.PRELIMINARY_WORK_ORDER: "Предварительный заказ-наряд",
        DocumentType.WORK_ORDER: "Рабочий заказ-наряд",
        DocumentType.COMPLETION_ACT: "Заказ-наряд",
        DocumentType.INSPECTION_ACT: "Акт приёма-передачи автомобиля",
    }

    def extract_placeholders(self, template_xml_text: str) -> list[str]:
        placeholders = []
        for raw in PLACEHOLDER_RE.findall(template_xml_text):
            normalized = self.normalize_placeholder_name(raw)
            if normalized:
                placeholders.append(normalized)
        return list(dict.fromkeys(placeholders))

    def normalize_placeholder_name(self, raw: str) -> str:
        return " ".join(raw.replace("\n", " ").split())

    def build_bundle(self, document: CrmDocument, template_placeholders: list[str]) -> TemplateRenderBundle:
        order = document.order
        client = order.client
        payer = getattr(order, "payer_client", None) or order.client
        owner = self._current_vehicle_owner(order)
        now = app_now_naive()

        missing_fields: list[str] = []
        if order is None:
            missing_fields.append("order")
        if client is None:
            missing_fields.append("client")
        if order.vehicle is None:
            missing_fields.append("vehicle")
        if owner is None:
            missing_fields.append("owner")
        if order.services is None:
            missing_fields.append("services")
        if missing_fields:
            raise AppError(
                code="validation_error",
                message=f"Missing fields: {', '.join(missing_fields)}",
                status_code=422,
            )

        field_values = self._order_field_values(order)
        order_reason = self._first_non_empty(
            field_values,
            keys=["reason", "service_reason", "order_reason", "reason_for_visit"],
            label_tokens=["причин", "обращен"],
            fallback=self._strip_or_empty(getattr(order, "comment", None)),
        )
        pay_method = self._first_non_empty(
            field_values,
            keys=["pay_method", "payment_method", "payment_type"],
            label_tokens=["способ оплаты", "оплата", "платеж"],
        )
        repair_type = self._resolve_repair_type(document.document_type, order.services, field_values)
        contact_name, contact_phone = self._resolve_contact(document.document_type, client, field_values)
        ready_at = self._ready_at(order)

        common = {
            "doc.no": str(document.document_number),
            "doc.date": self._format_date(now),
            "client.name": self._person_name(client),
            "client.phone": self._strip_or_empty(getattr(client, "phone_display", None)),
            "client.address": self._strip_or_empty(getattr(client, "address", None)),
            "client.org_name": self._strip_or_empty(getattr(client, "company_name", None)),
            "client.inn": self._strip_or_empty(getattr(client, "inn", None)),
            "client.kpp": self._strip_or_empty(getattr(client, "kpp", None)),
            "client.ogrn": self._strip_or_empty(getattr(client, "ogrn", None)),
            "client.legal_addr": self._strip_or_empty(getattr(client, "legal_address", None)),
            "client.actual_addr": self._strip_or_empty(getattr(client, "actual_address", None)),
            "client.rep_position": self._strip_or_empty(getattr(client, "representative_position", None)),
            "client.rep_name": self._strip_or_empty(getattr(client, "representative_full_name", None)),
            "client.rep_basis": self._strip_or_empty(getattr(client, "representative_basis", None)),
            "client.sign_name": self._client_sign_name(client),
            "client.individual": self._bool_text(self._is_individual(client)),
            "client.legal": self._bool_text(self._is_legal(client)),
            "payer.name": self._person_name(payer),
            "payer.phone": self._strip_or_empty(getattr(payer, "phone_display", None)),
            "payer.address": self._strip_or_empty(getattr(payer, "address", None)),
            "payer.org_name": self._strip_or_empty(getattr(payer, "company_name", None)),
            "payer.inn": self._strip_or_empty(getattr(payer, "inn", None)),
            "payer.kpp": self._strip_or_empty(getattr(payer, "kpp", None)),
            "payer.ogrn": self._strip_or_empty(getattr(payer, "ogrn", None)),
            "payer.legal_addr": self._strip_or_empty(getattr(payer, "legal_address", None)),
            "payer.actual_addr": self._strip_or_empty(getattr(payer, "actual_address", None)),
            "payer.rep_position": self._strip_or_empty(getattr(payer, "representative_position", None)),
            "payer.rep_name": self._strip_or_empty(getattr(payer, "representative_full_name", None)),
            "payer.rep_basis": self._strip_or_empty(getattr(payer, "representative_basis", None)),
            "payer.individual": self._bool_text(self._is_individual(payer)),
            "payer.legal": self._bool_text(self._is_legal(payer)),
            "contact.name": contact_name,
            "contact.phone": contact_phone,
            "owner.name": self._display_label(owner),
            "order.pay_method": pay_method,
            "order.reason": order_reason,
            "order.repair_type": repair_type,
            "order.ready_at": self._format_datetime(ready_at) if ready_at else "",
            "car.brand": self._strip_or_empty(getattr(order.vehicle, "brand", None)),
            "car.model": self._strip_or_empty(getattr(order.vehicle, "model", None)),
            "car.vin": self._strip_or_empty(getattr(order.vehicle, "vin", None)),
            "car.plate": self._strip_or_empty(getattr(order.vehicle, "plate_number_display", None)),
            "car.year": str(order.vehicle.year) if getattr(order.vehicle, "year", None) else "",
            "car.mileage": self._format_quantity(order.vehicle.mileage),
            "car.color": self._strip_or_empty(getattr(order.vehicle, "color", None)),
            "services.count": str(len(order.services)),
            "total": self._format_money(order.services_total),
            "disc": self._format_money(OrderCalculationService.effective_discount_amount(order)),
            "pay": self._format_money(order.amount_to_pay),
        }

        section_flags = {
            "client.individual": self._is_individual(client),
            "client.legal": self._is_legal(client),
            "payer.individual": self._is_individual(payer),
            "payer.legal": self._is_legal(payer),
        }

        service_rows = self._build_service_rows(document.document_type, order.services)
        known_placeholders = set(common)
        known_placeholders.update(section_flags.keys())
        known_placeholders.update(service_rows[0].keys() if service_rows else set())
        known_placeholders.update({"n", "srv.name", "srv.cat", "srv.qty", "srv.comment", "qty", "price", "sum"})
        unresolved = sorted(
            item
            for item in template_placeholders
            if item not in known_placeholders
            and not item.startswith("#")
            and not item.startswith("/")
        )

        preview_lines = [
            f"Шаблон: {document.template.name}",
            f"Документ № {document.document_number}",
            f"Тип: {self.DOCUMENT_TYPE_LABELS[document.document_type]}",
            f"Клиент: {self._display_label(client)}",
            f"Плательщик: {self._display_label(payer)}",
            f"Владелец ТС: {self._display_label(owner)}",
            f"Автомобиль: {self._vehicle_display(order.vehicle)}",
            f"Услуг: {len(order.services)}",
            f"К оплате: {common['pay']}",
        ]
        if unresolved:
            preview_lines.append(f"Неизвестные плейсхолдеры: {', '.join(unresolved)}")

        return TemplateRenderBundle(
            template_placeholders=template_placeholders,
            unresolved_placeholders=unresolved,
            manual_placeholders=[],
            manual_fields_by_design=self.MANUAL_FIELDS_BY_TYPE.get(document.document_type, []),
            common_replacements=common,
            service_rows=service_rows,
            material_rows=[],
            preview_content="\n".join(preview_lines),
            section_flags=section_flags,
        )

    @staticmethod
    def _strip_or_empty(value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def _bool_text(value: bool) -> str:
        return "true" if value else "false"

    @staticmethod
    def _is_individual(client) -> bool:
        return bool(getattr(client, "is_individual", None) if client is not None else False)

    @staticmethod
    def _is_legal(client) -> bool:
        return bool(getattr(client, "is_legal", None) if client is not None else False)

    def _display_label(self, client) -> str:
        if client is None:
            return ""
        for value in (
            getattr(client, "display_label", None),
            getattr(client, "company_name", None),
            getattr(client, "full_name", None),
            getattr(client, "phone_display", None),
        ):
            text = self._strip_or_empty(value)
            if text:
                return text
        return ""

    def _person_name(self, client) -> str:
        if client is None:
            return ""
        for value in (getattr(client, "full_name", None), getattr(client, "display_label", None), getattr(client, "company_name", None)):
            text = self._strip_or_empty(value)
            if text:
                return text
        return ""

    def _client_sign_name(self, client) -> str:
        if client is None:
            return ""
        if self._is_individual(client):
            return self._person_name(client)
        rep_name = self._strip_or_empty(getattr(client, "representative_full_name", None))
        if rep_name:
            return rep_name
        return self._strip_or_empty(getattr(client, "company_name", None))

    @staticmethod
    def _current_vehicle_owner(order):
        vehicle = order.vehicle
        current_owner = next((history.client for history in getattr(vehicle, "owner_history", []) if history.owned_to is None and history.client), None)
        return current_owner or getattr(vehicle, "client", None) or order.client

    def _order_field_values(self, order) -> dict[str, tuple[str | None, str]]:
        values: dict[str, tuple[str | None, str]] = {}
        for field_value in getattr(order, "field_values", []) or []:
            key = self._strip_or_empty(getattr(field_value, "field_key", None)).lower()
            label = self._strip_or_empty(getattr(getattr(field_value, "field_def", None), "label", None)).lower()
            values[key] = (getattr(field_value, "value", None), label)
        return values

    def _first_non_empty(
        self,
        field_values: dict[str, tuple[str | None, str]],
        *,
        keys: list[str],
        label_tokens: list[str],
        fallback: str = "",
    ) -> str:
        for key in keys:
            raw = field_values.get(key.lower())
            if raw:
                text = self._strip_or_empty(raw[0])
                if text:
                    return text
        for value, label in field_values.values():
            if label and any(token in label for token in label_tokens):
                text = self._strip_or_empty(value)
                if text:
                    return text
        return fallback

    @staticmethod
    def _ready_at(order) -> datetime | None:
        return getattr(order, "handover_at", None) or getattr(order, "due_date", None) or getattr(order, "completed_at", None)

    def _build_service_rows(self, document_type: DocumentType, services) -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        for index, row in enumerate(services or [], start=1):
            common = {
                "n": str(index),
                "srv.name": self._strip_or_empty(getattr(row, "service_name_snapshot", None)),
                "srv.cat": self._strip_or_empty(getattr(row, "category_name_snapshot", None)),
                "srv.qty": self._format_quantity(getattr(row, "quantity", None)),
                "srv.comment": "",
                "qty": self._format_quantity(getattr(row, "quantity", None)),
                "price": self._format_money(getattr(row, "unit_price", ZERO_MONEY)),
                "sum": self._format_money(getattr(row, "row_total", ZERO_MONEY)),
            }
            rows.append(common)

        if rows:
            return rows

        if document_type == DocumentType.WORK_ORDER:
            return [{"n": "", "srv.name": "", "srv.cat": "", "srv.qty": "", "srv.comment": "", "qty": "", "price": "", "sum": ""}]
        return [{"n": "", "srv.name": "", "srv.cat": "", "srv.qty": "", "srv.comment": "", "qty": "", "price": "", "sum": ""}]

    def _resolve_contact(self, document_type: DocumentType, client, field_values: dict[str, tuple[str | None, str]]) -> tuple[str, str]:
        if document_type in {DocumentType.COMPLETION_ACT, DocumentType.PRELIMINARY_WORK_ORDER}:
            return self._person_name(client), self._strip_or_empty(getattr(client, "phone_display", None))

        contact_name = self._first_non_empty(
            field_values,
            keys=["contact_name", "contact_person", "contact_full_name"],
            label_tokens=["контакт"],
        )
        contact_phone = self._first_non_empty(
            field_values,
            keys=["contact_phone", "contact_phone_display"],
            label_tokens=["телефон контакт", "контактный телефон"],
        )
        return contact_name, contact_phone

    def _resolve_repair_type(
        self,
        document_type: DocumentType,
        services,
        field_values: dict[str, tuple[str | None, str]],
    ) -> str:
        if document_type == DocumentType.WORK_ORDER:
            categories: list[str] = []
            seen: set[str] = set()
            for service in services or []:
                category = self._strip_or_empty(getattr(service, "category_name_snapshot", None))
                if category and category not in seen:
                    seen.add(category)
                    categories.append(category)
            if categories:
                return ", ".join(categories)

        return self._first_non_empty(
            field_values,
            keys=["repair_type", "work_type"],
            label_tokens=["тип ремонта", "вид ремонта"],
        )

    def _vehicle_display(self, vehicle) -> str:
        parts = [self._strip_or_empty(getattr(vehicle, "brand", None)), self._strip_or_empty(getattr(vehicle, "model", None))]
        return " ".join(part for part in parts if part).strip()

    @staticmethod
    def _format_date(value: datetime) -> str:
        return value.strftime("%d.%m.%Y")

    @staticmethod
    def _format_datetime(value: datetime) -> str:
        return value.strftime("%d.%m.%Y %H:%M")

    @staticmethod
    def _format_quantity(value: object) -> str:
        if value is None or value == "":
            return ""
        decimal_value = Decimal(str(value))
        normalized = decimal_value.normalize()
        text = format(normalized, "f").rstrip("0").rstrip(".")
        return text.replace(".", ",") if text else "0"

    @staticmethod
    def _format_money(value: object) -> str:
        decimal_value = Decimal(str(value)).quantize(Decimal("0.01"))
        integral = decimal_value == decimal_value.to_integral_value()
        if integral:
            number = f"{int(decimal_value):,}".replace(",", " ")
        else:
            number = f"{decimal_value:,.2f}".replace(",", " ").replace(".", ",")
        return f"{number} ₽"
