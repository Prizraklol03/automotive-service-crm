from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.crm.repositories.vehicle_repository import VehicleRepository  # noqa: E402
from app.crm.utils.normalization import normalize_plate_number, normalize_plate_search_query  # noqa: E402


class RecordingSession:
    def __init__(self) -> None:
        self.statement = None

    def scalars(self, statement):
        self.statement = statement
        return []


class VehicleSearchNormalizationTestCase(unittest.TestCase):
    def test_plate_normalization_preserves_cyrillic_letters(self) -> None:
        self.assertEqual(normalize_plate_number("У777УУ00"), "У777УУ00")
        self.assertEqual(normalize_plate_number("Т777ТТ00"), "Т777ТТ00")
        self.assertEqual(normalize_plate_search_query("у 777 уу 00"), "У777УУ00")

    def test_vehicle_repository_search_includes_brand_model_predicates(self) -> None:
        session = RecordingSession()
        repository = VehicleRepository(session)

        repository.search("MAZDA", search_query="Mazda")

        statement_sql = str(session.statement)
        self.assertIn("crm_vehicles.plate_number_normalized", statement_sql)
        self.assertIn("crm_vehicles.brand", statement_sql)
        self.assertIn("crm_vehicles.model", statement_sql)
        self.assertIn("crm_car_brands", statement_sql)
        self.assertIn("crm_car_models", statement_sql)
        self.assertIn("normalized_name", statement_sql)
