from __future__ import annotations

import sys
import unittest
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import AppError  # noqa: E402
from app.crm.models import CrmCarBrand, CrmCarModel, CrmClient, CrmOrder, CrmOrderService, CrmRole, CrmServiceCatalog  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus, StatusGroup  # noqa: E402
from app.crm.repositories.vehicle_repository import VehicleRepository  # noqa: E402
from app.crm.schemas.client import ClientCreate  # noqa: E402
from app.crm.schemas.order import OrderCreate, OrderServiceCreate  # noqa: E402
from app.crm.schemas.service_catalog import ServiceCatalogCreate  # noqa: E402
from app.crm.schemas.service_category import ServiceCategoryCreate  # noqa: E402
from app.crm.schemas.user import UserCreate  # noqa: E402
from app.crm.schemas.vehicle import VehicleCreate, VehicleOwnerChangeCreate  # noqa: E402
from app.crm.services.client_service import ClientService  # noqa: E402
from app.crm.services.order_calculation_service import OrderCalculationService  # noqa: E402
from app.crm.services.order_service import CrmOrderAppService  # noqa: E402
from app.crm.services.service_catalog_service import ServiceCatalogService  # noqa: E402
from app.crm.services.service_category_service import ServiceCategoryService  # noqa: E402
from app.crm.services.user_service import UserService  # noqa: E402
from app.crm.services.vehicle_service import VehicleService  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class CrmFoundationTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.db_harness = create_schema_harness(metadata=Base.metadata)
        self.engine = self.db_harness.engine
        self.SessionLocal = self.db_harness.SessionLocal
        self.session = self.SessionLocal()
        self._seed_order_statuses()

    def tearDown(self) -> None:
        self.session.close()
        self.db_harness.close()

    def _seed_order_statuses(self) -> None:
        self.session.add_all(
            [
                CrmOrderStatus(
                    code="new",
                    display_name="Черновик",
                    status_group=StatusGroup.NEW.value,
                    color="#6b7280",
                    sort_order=10,
                    is_default=True,
                ),
                CrmOrderStatus(
                    code="done",
                    display_name="Ожидает",
                    status_group=StatusGroup.DONE.value,
                    color="#10b981",
                    sort_order=30,
                    is_default=False,
                ),
                CrmOrderStatus(
                    code="closed",
                    display_name="Завершён",
                    status_group=StatusGroup.CLOSED.value,
                    color="#0f766e",
                    sort_order=40,
                    is_default=False,
                ),
            ]
        )
        self.session.commit()

    def create_client(self, phone: str = "+7 (000) 000-00-01", telegram_username: str | None = None) -> CrmClient:
        return ClientService(self.session).create(
            ClientCreate(full_name="Demo Customer 03", phone=phone, telegram_username=telegram_username, comment=None)
        )

    def create_brand_model(self) -> tuple[CrmCarBrand, CrmCarModel]:
        brand = self.session.scalar(select(CrmCarBrand).where(CrmCarBrand.name == "Lada"))
        if brand is None:
            brand = CrmCarBrand(name="Lada", normalized_name="lada", sort_order=0, is_active=True)
            self.session.add(brand)
            self.session.flush()

        model = self.session.scalar(select(CrmCarModel).where(CrmCarModel.brand_id == brand.id, CrmCarModel.name == "Vesta"))
        if model is None:
            model = CrmCarModel(brand_id=brand.id, name="Vesta", normalized_name="vesta", sort_order=0, is_active=True)
            self.session.add(model)
            self.session.commit()
        return brand, model

    def create_vehicle(self, client_id: int, plate: str = "A 777 AA 00"):
        brand, model = self.create_brand_model()
        return VehicleService(self.session).create(
            VehicleCreate(
                client_id=client_id,
                plate_number=plate,
                vin=None,
                brand_id=brand.id,
                model_id=model.id,
                brand=None,
                model=None,
                year=2022,
                mileage=54000,
                color="Black",
                comment=None,
            )
        )

    def create_catalog_service(self) -> CrmServiceCatalog:
        category = ServiceCategoryService(self.session).create(
            ServiceCategoryCreate(name="Wash", sort_order=0, is_active=True)
        )
        return ServiceCatalogService(self.session).create(
            ServiceCatalogCreate(category_id=category.id, name="Full Package", default_price=Decimal("2500.00"), is_active=True)
        )

    def test_phone_normalization_uniqueness(self) -> None:
        first = self.create_client("8 000 000-00-01")
        self.assertEqual(first.phone_normalized, "+70000000001")
        self.assertEqual(first.phone_display, "+70000000001")

        with self.assertRaises(AppError):
            self.create_client("+7 (000) 000-00-01")

    def test_client_telegram_username_is_normalized(self) -> None:
        client = self.create_client(telegram_username="  @@detailing_client  ")
        self.assertEqual(client.telegram_username, "@detailing_client")

        blank_client = self.create_client(phone="+7 (000) 000-00-02", telegram_username="   ")
        self.assertIsNone(blank_client.telegram_username)

    def test_client_service_supports_legal_profile(self) -> None:
        service = ClientService(self.session)
        client = service.create(
            ClientCreate(
                client_type="legal",
                full_name=None,
                company_name="OOO Detailing Plus",
                phone="+7 (000) 000-00-03",
                address=None,
                inn="7701234567",
                kpp=None,
                ogrn=None,
                legal_address="Moscow, Tverskaya 1",
                actual_address=None,
                representative_full_name="Demo Customer 03",
                representative_position="Director",
                representative_basis="Charter",
                telegram_username=None,
                comment="Legal client",
            )
        )

        self.assertEqual(client.client_type, "legal")
        self.assertEqual(client.company_name, "OOO Detailing Plus")
        self.assertEqual(client.full_name, "OOO Detailing Plus")
        self.assertEqual(client.display_label, "OOO Detailing Plus")
        self.assertTrue(client.is_legal)
        self.assertFalse(client.is_individual)

        updated = service.update(
            client.id,
            ClientCreate(
                client_type="legal",
                full_name=None,
                phone="+7 (000) 000-00-04",
                comment="Updated legal client",
            ),
        )
        self.assertEqual(updated.company_name, "OOO Detailing Plus")
        self.assertEqual(updated.legal_address, "Moscow, Tverskaya 1")
        self.assertEqual(updated.display_label, "OOO Detailing Plus")
        self.assertEqual(updated.phone_display, "+70000000004")

    def test_plate_normalization_uniqueness(self) -> None:
        client = self.create_client()
        first = self.create_vehicle(client.id, "a777aa00")
        self.assertEqual(first.plate_number_normalized, "A777AA00")

        with self.assertRaises(AppError):
            self.create_vehicle(client.id, "A 777 AA 00")

    def test_vehicle_supports_mileage_and_reference_catalog(self) -> None:
        client = self.create_client()
        vehicle = self.create_vehicle(client.id)

        self.assertEqual(vehicle.mileage, 54000)
        self.assertIsNotNone(vehicle.brand_id)
        self.assertIsNotNone(vehicle.model_id)
        self.assertEqual(vehicle.brand, "Lada")
        self.assertEqual(vehicle.model, "Vesta")

    def test_default_roles_seed_is_idempotent(self) -> None:
        service = UserService(self.session)
        first = service.ensure_default_roles()
        second = service.ensure_default_roles()

        self.assertEqual(sorted(role.code for role in first), ["admin", "employee"])
        self.assertEqual(sorted(role.code for role in second), ["admin", "employee"])
        all_roles = self.session.scalars(select(CrmRole).order_by(CrmRole.code)).all()
        self.assertEqual([role.code for role in all_roles], ["admin", "employee"])

    def test_bootstrap_admin_creates_first_user_only_once(self) -> None:
        service = UserService(self.session)
        service.ensure_default_roles()

        created = service.ensure_bootstrap_admin(login="admin", password="synthetic-bootstrap-password", full_name="Demo Customer 13")
        self.assertIsNotNone(created)
        self.assertEqual(created.login, "admin")
        self.assertEqual(created.role.code, "admin")

        repeated = service.ensure_bootstrap_admin(login="admin-2", password="admin456", full_name="Demo Customer 14")
        self.assertIsNone(repeated)

    def test_order_calculations_use_fixed_discount_value(self) -> None:
        order = CrmOrder(
            client_id=1,
            vehicle_id=1,
            status="new",
            discount_value=Decimal("100.00"),
            discount_type="fixed",
        )
        order.services.extend(
            [
                CrmOrderService(service_name_snapshot="Wash", unit_price=Decimal("1000.00"), quantity=2),
                CrmOrderService(service_name_snapshot="Polish", unit_price=Decimal("500.00"), quantity=1),
            ]
        )

        OrderCalculationService.recalculate_order(order)

        self.assertEqual(order.services_total, Decimal("2500.00"))
        self.assertEqual(order.amount_to_pay, Decimal("2400.00"))
        self.assertFalse(hasattr(order, "profit"))

    def test_order_calculations_use_percent_discount_value(self) -> None:
        order = CrmOrder(
            client_id=1,
            vehicle_id=1,
            status="new",
            discount_value=Decimal("10.00"),
            discount_type="percent",
        )
        order.services.append(CrmOrderService(service_name_snapshot="Wash", unit_price=Decimal("2000.00"), quantity=1))

        OrderCalculationService.recalculate_order(order)

        self.assertEqual(order.services_total, Decimal("2000.00"))
        self.assertEqual(order.amount_to_pay, Decimal("1800.00"))

    def test_rejects_percent_discount_above_100(self) -> None:
        order = CrmOrder(
            client_id=1,
            vehicle_id=1,
            status="new",
            discount_value=Decimal("150.00"),
            discount_type="percent",
        )
        order.services.append(CrmOrderService(service_name_snapshot="Wash", unit_price=Decimal("1000.00"), quantity=1))

        with self.assertRaises(AppError):
            OrderCalculationService.recalculate_order(order)

    def test_validation_messages_are_readable_utf8(self) -> None:
        self.assertEqual(OrderCalculationService.validate_price(Decimal("0.00"), field="unit_price"), Decimal("0.00"))

        self.assertEqual(OrderCalculationService.validate_price(Decimal("0.99"), field="unit_price"), Decimal("0.99"))

        with self.assertRaises(AppError) as price_error:
            OrderCalculationService.validate_price(Decimal("-0.01"), field="unit_price")
        self.assertEqual(price_error.exception.message, "Цена позиции не может быть отрицательной")

        with self.assertRaises(AppError) as quantity_error:
            OrderCalculationService.validate_quantity(0, field="quantity")
        self.assertEqual(quantity_error.exception.message, "Количество должно быть не менее 1")

        with self.assertRaises(AppError) as type_error:
            OrderCalculationService.validate_discount_type("bonus")
        self.assertEqual(type_error.exception.message, "Тип скидки должен быть fixed или percent")

        with self.assertRaises(AppError) as negative_discount_error:
            OrderCalculationService.validate_discount_value(Decimal("-1.00"), discount_type="fixed")
        self.assertEqual(negative_discount_error.exception.message, "Скидка не может быть отрицательной")

        with self.assertRaises(AppError) as percent_error:
            OrderCalculationService.validate_discount_value(Decimal("101.00"), discount_type="percent")
        self.assertEqual(percent_error.exception.message, "Процент скидки не может превышать 100")

    def test_order_service_create_uses_discount_value_and_type(self) -> None:
        UserService(self.session).ensure_default_roles()
        client = self.create_client()
        vehicle = self.create_vehicle(client.id)
        catalog_service = self.create_catalog_service()

        order = CrmOrderAppService(self.session).create(
            OrderCreate(
                client_id=client.id,
                vehicle_id=vehicle.id,
                status="new",
                comment="Created via service",
                discount_value=Decimal("10.00"),
                discount_type="percent",
                services=[
                    OrderServiceCreate(
                        service_catalog_id=catalog_service.id,
                        service_name_snapshot="Full Package",
                        category_name_snapshot="Wash",
                        unit_price=Decimal("2500.00"),
                        quantity=1,
                        sort_key=0,
                    )
                ],
            )
        )

        self.assertEqual(order.discount_value, Decimal("10.00"))
        self.assertEqual(order.discount_type, "percent")
        self.assertEqual(order.services_total, Decimal("2500.00"))
        self.assertEqual(order.amount_to_pay, Decimal("2250.00"))

    def test_vehicle_repository_lists_by_authoritative_owner_history(self) -> None:
        first_client = self.create_client(phone="+70000000002")
        second_client = self.create_client(phone="+70000000003")
        vehicle = self.create_vehicle(first_client.id, "A 778 AA 00")

        VehicleService(self.session).change_owner(vehicle.id, VehicleOwnerChangeCreate(client_id=second_client.id))

        vehicle_row = self.session.get(type(vehicle), vehicle.id)
        self.assertIsNotNone(vehicle_row)
        vehicle_row.client_id = first_client.id
        self.session.commit()

        repository = VehicleRepository(self.session)
        second_client_vehicles = [item.id for item in repository.list_by_client(second_client.id)]
        first_client_vehicles = [item.id for item in repository.list_by_client(first_client.id)]

        self.assertIn(vehicle.id, second_client_vehicles)
        self.assertNotIn(vehicle.id, first_client_vehicles)

    def test_order_service_allows_customer_to_differ_from_vehicle_owner(self) -> None:
        UserService(self.session).ensure_default_roles()
        first_client = self.create_client(phone="+70000000004")
        second_client = self.create_client(phone="+70000000005")
        vehicle = self.create_vehicle(first_client.id, "A 779 AA 00")

        VehicleService(self.session).change_owner(vehicle.id, VehicleOwnerChangeCreate(client_id=second_client.id))

        vehicle_row = self.session.get(type(vehicle), vehicle.id)
        self.assertIsNotNone(vehicle_row)
        vehicle_row.client_id = first_client.id
        self.session.commit()

        order_service = CrmOrderAppService(self.session)
        order = order_service.create(
            OrderCreate(
                client_id=first_client.id,
                vehicle_id=vehicle.id,
                status="new",
                comment="Customer differs from owner",
                services=[],
            )
        )
        self.assertEqual(order.client_id, first_client.id)
        self.assertIsNone(order.payer_client_id)

        order_with_payer = order_service.create(
            OrderCreate(
                client_id=first_client.id,
                payer_client_id=second_client.id,
                vehicle_id=vehicle.id,
                status="new",
                comment="Customer and payer differ from owner",
                services=[],
            )
        )
        self.assertEqual(order_with_payer.client_id, first_client.id)
        self.assertEqual(order_with_payer.payer_client_id, second_client.id)

        updated = order_service.update(
            order_with_payer.id,
            OrderCreate(
                client_id=first_client.id,
                vehicle_id=vehicle.id,
                status="new",
                comment="Updated without explicit payer",
                services=[],
            ),
        )
        self.assertEqual(updated.payer_client_id, second_client.id)

        cleared = order_service.update(
            order_with_payer.id,
            OrderCreate(
                client_id=first_client.id,
                payer_client_id=None,
                vehicle_id=vehicle.id,
                status="new",
                comment="Updated with cleared payer",
                services=[],
            ),
        )
        self.assertIsNone(cleared.payer_client_id)


if __name__ == "__main__":
    unittest.main()
