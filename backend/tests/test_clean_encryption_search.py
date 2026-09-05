from __future__ import annotations

from sqlalchemy import text

from app.core.privacy import hash_plate_fragment_lookup_candidates
from app.crm.repositories.client_repository import ClientRepository
from app.crm.repositories.vehicle_repository import VehicleRepository
from app.crm.schemas.client import ClientCreate
from app.crm.schemas.vehicle import VehicleCreate
from app.crm.services.client_service import ClientService
from app.crm.services.vehicle_service import VehicleService
from app.db.base import Base
from postgres_test_utils import create_schema_harness


def test_encrypted_fields_and_blind_search_work_together() -> None:
    harness = create_schema_harness(metadata=Base.metadata)
    session = harness.SessionLocal()
    try:
        client = ClientService(session).create(
            ClientCreate(full_name="Synthetic Search Person", phone="+70000000001")
        )
        vehicle = VehicleService(session).create(
            VehicleCreate(
                client_id=client.id,
                plate_number="A777AA00",
                vin="VIN12345678901234",
                brand="Lada",
                model="Vesta",
            )
        )

        raw_client = session.execute(
            text(
                "SELECT full_name, phone_display, phone_search_hash, phone_fragment_hashes, name_search_hashes "
                "FROM crm_clients WHERE id = :id"
            ),
            {"id": client.id},
        ).one()
        raw_vehicle = session.execute(
            text(
                "SELECT plate_number_display, vin, plate_search_hash, plate_fragment_hashes, vin_search_hash "
                "FROM crm_vehicles WHERE id = :id"
            ),
            {"id": vehicle.id},
        ).one()

        assert "Synthetic Search Person" not in raw_client.full_name
        assert "+70000000001" not in raw_client.phone_display
        assert raw_client.phone_search_hash
        assert raw_client.phone_fragment_hashes
        assert all(fragment not in raw_client.phone_fragment_hashes for fragment in ("1234", "4567", "70000000001"))
        assert raw_client.name_search_hashes
        assert "A777AA00" not in raw_vehicle.plate_number_display
        assert "VIN12345678901234" not in raw_vehicle.vin
        assert raw_vehicle.plate_search_hash
        assert raw_vehicle.plate_fragment_hashes
        assert all(fragment not in raw_vehicle.plate_fragment_hashes for fragment in ("A7", "777", "AA77"))
        assert set(raw_vehicle.plate_fragment_hashes).intersection(hash_plate_fragment_lookup_candidates("AA77"))
        assert raw_vehicle.vin_search_hash

        client_by_phone = ClientRepository(session).get_by_normalized_phone("70000000001")
        clients_by_name = ClientRepository(session).search(
            name_query="Synthetic Search Person",
            phone_query=None,
            telegram_query=None,
        )
        vehicle_by_plate = VehicleRepository(session).get_by_normalized_plate("A777AA00")
        vehicles_by_vin = VehicleRepository(session).search(None, "VIN12345678901234")

        assert client_by_phone is not None and client_by_phone.id == client.id
        assert [item.id for item in clients_by_name] == [client.id]
        assert vehicle_by_plate is not None and vehicle_by_plate.id == vehicle.id
        assert [item.id for item in vehicles_by_vin] == [vehicle.id]

        VehicleService(session).update(
            vehicle.id,
            VehicleCreate(
                client_id=client.id,
                plate_number="T002ST124",
                vin="VIN12345678901234",
                brand="Lada",
                model="Vesta",
            ),
        )
        updated_hashes = session.execute(
            text("SELECT plate_fragment_hashes FROM crm_vehicles WHERE id = :id"),
            {"id": vehicle.id},
        ).scalar_one()
        assert set(updated_hashes).intersection(hash_plate_fragment_lookup_candidates("ST12"))
        assert not set(updated_hashes).intersection(hash_plate_fragment_lookup_candidates("AA77"))
    finally:
        session.close()
        harness.close()
