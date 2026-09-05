from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from app.core.errors import AppError
from app.crm.models.order import CrmOrder
from app.crm.models.order_service import CrmOrderService

MONEY_PLACES = Decimal("0.01")
MIN_PRICE = Decimal("0.00")
MIN_QUANTITY = 1
MAX_PERCENT_DISCOUNT = Decimal("100.00")


class OrderCalculationService:
    @staticmethod
    def quantize(value: Decimal) -> Decimal:
        return value.quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)

    @classmethod
    def validate_price(cls, value: Decimal, *, field: str) -> Decimal:
        if value < MIN_PRICE:
            raise AppError(
                code="validation_error",
                message="Цена позиции не может быть отрицательной",
                status_code=422,
                details={"field": field},
            )
        return cls.quantize(value)

    @staticmethod
    def validate_quantity(value: int, *, field: str) -> int:
        if value < MIN_QUANTITY:
            raise AppError(
                code="validation_error",
                message="Количество должно быть не менее 1",
                status_code=422,
                details={"field": field},
            )
        return value

    @classmethod
    def validate_discount_type(cls, value: str) -> str:
        normalized = (value or "fixed").strip().lower()
        if normalized not in {"fixed", "percent"}:
            raise AppError(
                code="validation_error",
                message="Тип скидки должен быть fixed или percent",
                status_code=422,
                details={"field": "discount_type"},
            )
        return normalized

    @classmethod
    def validate_discount_value(cls, value: Decimal, *, discount_type: str) -> Decimal:
        discount = cls.quantize(Decimal(value))
        if discount < 0:
            raise AppError(
                code="validation_error",
                message="Скидка не может быть отрицательной",
                status_code=422,
                details={"field": "discount_value"},
            )
        if discount_type == "percent" and discount > MAX_PERCENT_DISCOUNT:
            raise AppError(
                code="validation_error",
                message="Процент скидки не может превышать 100",
                status_code=422,
                details={"field": "discount_value"},
            )
        return discount

    @classmethod
    def calculate_discount_amount(
        cls,
        *,
        services_total: Decimal,
        discount_value: Decimal,
        discount_type: str,
    ) -> Decimal:
        if discount_type == "percent":
            return cls.quantize(services_total * discount_value / MAX_PERCENT_DISCOUNT)
        return cls.quantize(discount_value)

    @classmethod
    def effective_discount_amount(cls, order: CrmOrder) -> Decimal:
        services_total = cls.quantize(Decimal(order.services_total or Decimal("0.00")))
        discount_type = cls.validate_discount_type(getattr(order, "discount_type", "fixed"))
        discount_value = cls.validate_discount_value(
            Decimal(getattr(order, "discount_value", Decimal("0.00")) or Decimal("0.00")),
            discount_type=discount_type,
        )
        return cls.calculate_discount_amount(
            services_total=services_total,
            discount_value=discount_value,
            discount_type=discount_type,
        )

    @classmethod
    def service_row_total(cls, row: CrmOrderService) -> Decimal:
        row.unit_price = cls.validate_price(Decimal(row.unit_price), field="unit_price")
        row.quantity = cls.validate_quantity(int(row.quantity), field="quantity")
        row.row_total = cls.quantize(row.unit_price * row.quantity)
        return row.row_total

    @classmethod
    def recalculate_order(cls, order: CrmOrder) -> CrmOrder:
        services_total = sum((cls.service_row_total(row) for row in order.services), Decimal("0.00"))
        order.services_total = cls.quantize(services_total)
        order.discount_type = cls.validate_discount_type(getattr(order, "discount_type", "fixed"))
        order.discount_value = cls.validate_discount_value(
            Decimal(getattr(order, "discount_value", Decimal("0.00")) or Decimal("0.00")),
            discount_type=order.discount_type,
        )
        discount_amount = cls.calculate_discount_amount(
            services_total=order.services_total,
            discount_value=order.discount_value,
            discount_type=order.discount_type,
        )
        order.amount_to_pay = cls.quantize(order.services_total - discount_amount)
        return order
