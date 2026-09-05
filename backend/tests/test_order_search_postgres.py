from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.crm import models as crm_models  # noqa: E402,F401
from app.core.privacy import hash_plate_lookup, hash_plate_search_fragments, hash_vin_lookup  # noqa: E402
from app.crm.models.order import CrmOrder  # noqa: E402
from app.crm.models.order_status import CrmOrderStatus  # noqa: E402
from app.crm.models.vehicle import CrmVehicle  # noqa: E402
from app.crm.repositories.order_repository import OrderRepository  # noqa: E402
from app.crm.schemas.client import ClientCreate  # noqa: E402
from app.crm.services.client_service import ClientService  # noqa: E402
from app.crm.utils.normalization import normalize_plate_number, normalize_upper_text  # noqa: E402
from app.db.base import Base  # noqa: E402
from postgres_test_utils import create_schema_harness  # noqa: E402


class TestOrderSearchPostgres:
    def setup_method(self) -> None:
        self.harness = create_schema_harness(metadata=Base.metadata)
        self.session = self.harness.SessionLocal()
        self.session.add(
            CrmOrderStatus(
                code="new",
                display_name="Новый",
                status_group="new",
                color="#6b7280",
                sort_order=10,
                is_default=True,
            )
        )
        self.session.commit()

    def teardown_method(self) -> None:
        self.session.close()
        self.harness.close()

    def _create_client(self, full_name: str, phone: str):
        return ClientService(self.session).create(ClientCreate(full_name=full_name, phone=phone))

    def _create_vehicle(self, client_id: int, *, plate: str, vin: str, brand: str, model: str) -> CrmVehicle:
        normalized_plate = normalize_plate_number(plate)
        normalized_vin = normalize_upper_text(vin)
        vehicle = CrmVehicle(
            client_id=client_id,
            plate_number_display=plate.upper(),
            plate_number_normalized=normalized_plate,
            plate_search_hash=hash_plate_lookup(normalized_plate),
            plate_fragment_hashes=hash_plate_search_fragments(normalized_plate),
            vin=normalized_vin,
            vin_search_hash=hash_vin_lookup(normalized_vin),
            brand=brand,
            model=model,
            year=2024,
            mileage=1000,
        )
        self.session.add(vehicle)
        self.session.flush()
        return vehicle

    def _create_order(self, client_id: int, vehicle_id: int, *, payer_client_id: int | None = None) -> CrmOrder:
        order = CrmOrder(
            client_id=client_id,
            payer_client_id=payer_client_id,
            vehicle_id=vehicle_id,
            status="new",
            discount_value=Decimal("0.00"),
            discount_type="fixed",
            services_total=Decimal("0.00"),
            amount_to_pay=Decimal("0.00"),
        )
        self.session.add(order)
        self.session.flush()
        return order

    def _search_ids(self, query: str) -> list[int]:
        items, _, _, _ = OrderRepository(self.session).list_page(
            archived_scope="all",
            search=query,
            page=1,
            page_size=50,
        )
        return [item.id for item in items]

    def test_cross_field_tokens_phone_and_plate_fragments_and_exact_identifiers(self) -> None:
        target_client = self._create_client("Тестовый Клиент 04", "+70000000038")
        payer_client = self._create_client("Тестовый Клиент 05", "+70000000040")
        decoy_client = self._create_client("Тестовый Клиент 02", "+70000000039")
        target_vehicle = self._create_vehicle(
            target_client.id,
            plate="T002ST124",
            vin="ZZZ00000000000001",
            brand="Mazda",
            model="CX-5",
        )
        decoy_vehicle = self._create_vehicle(
            decoy_client.id,
            plate="В456СС",
            vin="ZZZ00000000000002",
            brand="Mazda",
            model="3",
        )
        target_order = self._create_order(target_client.id, target_vehicle.id, payer_client_id=payer_client.id)
        decoy_order = self._create_order(decoy_client.id, decoy_vehicle.id)
        self.session.commit()

        assert self._search_ids("Mazda CX-5") == [target_order.id]
        assert self._search_ids("Иванов ST12") == [target_order.id]
        assert self._search_ids("Иван 4821") == [target_order.id]
        assert self._search_ids("Сидоров 5566") == [target_order.id]
        assert self._search_ids("12348") == [target_order.id]
        assert self._search_ids("4821") == [target_order.id]
        assert self._search_ids("+7 (000) 000-00-38") == [target_order.id]
        for plate_query in ("T0", "02", "ST", "ST12", "124", "T002ST124"):
            assert self._search_ids(plate_query) == [target_order.id]
        assert self._search_ids("т-002-sт-124") == [target_order.id]
        assert self._search_ids("s-t-12") == [target_order.id]
        assert target_order.id not in self._search_ids("T")
        assert self._search_ids("ZZZ00000000000001") == [target_order.id]
        assert self._search_ids(str(target_order.id)) == [target_order.id]
        assert target_order.id in self._search_ids("Иван")
        assert target_order.id not in self._search_ids("821")
        assert target_order.id not in self._search_ids("Mazda CX-5 отсутствует")
        assert target_order.id not in self._search_ids("Иванов ZX99")
        assert decoy_order.id not in self._search_ids("Mazda CX-5")

        ClientService(self.session).update(
            target_client.id,
            ClientCreate(full_name="Тестовый Клиент 04", phone="+70000000041"),
        )
        assert self._search_ids("Иван 4321") == [target_order.id]
        assert target_order.id not in self._search_ids("Иван 4821")
