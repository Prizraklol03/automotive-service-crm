from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.crm.models.order import CrmOrder
from app.crm.models.custom_field import CustomFieldDef, FieldType, OrderFieldValue
from app.crm.schemas.custom_field import (
    CustomFieldDefCreatePayload,
    CustomFieldDefRead,
    CustomFieldDefUpdatePayload,
    OrderFieldValueRead,
    OrderFieldValuesPayload,
)

VALID_FIELD_TYPES = {t.value for t in FieldType}


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w]", "_", text.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "field"


class CustomFieldService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _validate_type(self, field_type: str) -> None:
        if field_type not in VALID_FIELD_TYPES:
            raise AppError(
                code="validation_error",
                message=f"Недопустимый тип поля: {field_type!r}. Допустимые: {', '.join(sorted(VALID_FIELD_TYPES))}",
                status_code=422,
            )

    def _generate_unique_key(self, label: str) -> str:
        base = _slugify(label)[:40]
        suffix = uuid.uuid4().hex[:6]
        key = f"{base}_{suffix}"
        while self.session.get(CustomFieldDef, key) is not None:
            suffix = uuid.uuid4().hex[:6]
            key = f"{base}_{suffix}"
        return key

    def _normalize_value(self, field_def: CustomFieldDef, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        if field_def.field_type != FieldType.CHECKBOX.value and normalized == "":
            return None

        if field_def.field_type == FieldType.NUMBER.value:
            try:
                Decimal(normalized)
            except (InvalidOperation, ValueError) as exc:
                raise AppError(
                    code="validation_error",
                    message=f"Поле «{field_def.label}» должно быть числом",
                    status_code=422,
                ) from exc
            return normalized

        if field_def.field_type == FieldType.CHECKBOX.value:
            if normalized not in {"true", "false"}:
                raise AppError(
                    code="validation_error",
                    message=f"Поле «{field_def.label}» должно быть true или false",
                    status_code=422,
                )
            return normalized

        if field_def.field_type == FieldType.DATE.value:
            try:
                date.fromisoformat(normalized)
            except ValueError as exc:
                raise AppError(
                    code="validation_error",
                    message=f"Поле «{field_def.label}» должно быть датой в формате YYYY-MM-DD",
                    status_code=422,
                ) from exc
            return normalized

        if field_def.field_type == FieldType.SELECT.value:
            options = field_def.options or []
            if normalized not in options:
                raise AppError(
                    code="validation_error",
                    message=f"Поле «{field_def.label}» должно содержать одно из допустимых значений",
                    status_code=422,
                )
            return normalized

        return normalized

    def _validate_required_values(
        self,
        defs_by_key: dict[str, CustomFieldDef],
        merged_values: dict[str, str | None],
    ) -> None:
        for field_def in defs_by_key.values():
            value = merged_values.get(field_def.key)
            if value is None and field_def.is_required:
                raise AppError(
                    code="validation_error",
                    message=f"Поле «{field_def.label}» обязательно для заполнения",
                    status_code=422,
                )

    # -- Field Defs ------------------------------------------------------------

    def list_defs(self) -> list[CustomFieldDef]:
        return list(
            self.session.scalars(
                select(CustomFieldDef).order_by(CustomFieldDef.sort_order, CustomFieldDef.key)
            )
        )

    def get_def(self, key: str) -> CustomFieldDef:
        record = self.session.get(CustomFieldDef, key)
        if not record:
            raise AppError(code="not_found", message="Поле не найдено", status_code=404)
        return record

    def create_def(self, payload: CustomFieldDefCreatePayload) -> CustomFieldDef:
        self._validate_type(payload.field_type)
        key = self._generate_unique_key(payload.label)
        record = CustomFieldDef(
            key=key,
            label=payload.label.strip(),
            field_type=payload.field_type,
            is_required=payload.is_required,
            sort_order=payload.sort_order,
            placeholder=payload.placeholder,
            options=payload.options if payload.field_type == FieldType.SELECT.value else None,
        )
        self.session.add(record)
        self.session.commit()
        return record

    def update_def(self, key: str, payload: CustomFieldDefUpdatePayload) -> CustomFieldDef:
        self._validate_type(payload.field_type)
        record = self.get_def(key)
        record.label = payload.label.strip()
        record.field_type = payload.field_type
        record.is_required = payload.is_required
        record.sort_order = payload.sort_order
        record.placeholder = payload.placeholder
        record.options = payload.options if payload.field_type == FieldType.SELECT.value else None
        self.session.commit()
        return record

    def delete_def(self, key: str) -> None:
        record = self.get_def(key)
        self.session.delete(record)
        self.session.commit()

    def reorder_defs(self, keys: list[str]) -> list[CustomFieldDef]:
        all_defs = {d.key: d for d in self.list_defs()}
        expected_keys = set(all_defs)
        incoming_keys = list(keys)

        if set(incoming_keys) != expected_keys or len(incoming_keys) != len(expected_keys):
            raise AppError(
                code="validation_error",
                message="Нужно передать полный список ключей полей без пропусков и дубликатов",
                status_code=422,
            )

        for idx, key in enumerate(keys):
            all_defs[key].sort_order = idx
        self.session.commit()
        return self.list_defs()

    # -- Order Field Values ---------------------------------------------------

    def get_order_field_values(self, order_id: int) -> list[OrderFieldValueRead]:
        defs = self.list_defs()
        values_map: dict[str, str | None] = {}

        existing = list(
            self.session.scalars(
                select(OrderFieldValue).where(OrderFieldValue.order_id == order_id)
            )
        )
        for fv in existing:
            values_map[fv.field_key] = fv.value

        return [
            OrderFieldValueRead(
                field_key=d.key,
                value=values_map.get(d.key),
                label=d.label,
                field_type=d.field_type,
                is_required=d.is_required,
                placeholder=d.placeholder,
                options=d.options,
                sort_order=d.sort_order,
            )
            for d in defs
        ]

    def upsert_order_field_values(self, order_id: int, payload: OrderFieldValuesPayload) -> list[OrderFieldValueRead]:
        if self.session.get(CrmOrder, order_id) is None:
            raise AppError(code="not_found", message="Заказ не найден", status_code=404)

        defs = self.list_defs()
        defs_by_key = {field_def.key: field_def for field_def in defs}

        existing_values = {
            field_value.field_key: field_value.value
            for field_value in self.session.scalars(
                select(OrderFieldValue).where(OrderFieldValue.order_id == order_id)
            )
        }

        normalized_payload: dict[str, str | None] = {}
        for field_key, value in payload.values.items():
            field_def = defs_by_key.get(field_key)
            if field_def is None:
                raise AppError(
                    code="validation_error",
                    message=f"Поле '{field_key}' не найдено",
                    status_code=422,
                )

            normalized_payload[field_key] = self._normalize_value(field_def, value)

        merged_values = {**existing_values, **normalized_payload}
        self._validate_required_values(defs_by_key, merged_values)

        for field_key, value in normalized_payload.items():
            existing = self.session.get(OrderFieldValue, (order_id, field_key))
            if existing:
                existing.value = value
            else:
                self.session.add(
                    OrderFieldValue(order_id=order_id, field_key=field_key, value=value)
                )
        self.session.commit()
        return self.get_order_field_values(order_id)

    @staticmethod
    def to_def_read(record: CustomFieldDef) -> CustomFieldDefRead:
        return CustomFieldDefRead.model_validate(record)
