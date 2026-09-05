from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.crm.repositories.order_repository import OrderRepository  # noqa: E402
from app.core.crypto import get_blind_index_service  # noqa: E402
from app.core.privacy import (  # noqa: E402
    hash_plate_fragment_lookup_candidates,
    hash_plate_search_fragments,
    hash_phone_fragment_lookup_candidates,
    hash_phone_search_fragments,
)


class RecordingSession:
    def __init__(self) -> None:
        self.statement = None

    def scalars(self, statement):
        self.statement = statement
        return self

    def unique(self):
        return []


class OrderSearchNormalizationTestCase(unittest.TestCase):
    def test_empty_search_does_not_add_a_false_predicate(self) -> None:
        repository = OrderRepository(None)

        for search in (None, "", "   "):
            statement = repository._build_summary_statement(
                archived_scope="active",
                search=search,
                status_codes=["new"],
            )
            statement_sql = str(statement)
            self.assertNotIn("WHERE false", statement_sql, search)
            self.assertIn("crm_orders.status IN", statement_sql)

    def test_plate_fragment_hashes_cover_normalized_two_plus_character_fragments(self) -> None:
        stored_hashes = set(hash_plate_search_fragments("T002ST124"))

        for query in ("T0", "02", "ST", "ST12", "124", "T002ST124", "т-002-sт-124", "s-t-12"):
            self.assertTrue(stored_hashes.intersection(hash_plate_fragment_lookup_candidates(query)), query)
        self.assertEqual(hash_plate_fragment_lookup_candidates("T"), [])
        self.assertNotIn("ST12", stored_hashes)
        self.assertIn(get_blind_index_service().hash_value("ST12", scope="plate_fragment"), stored_hashes)
        self.assertNotIn(get_blind_index_service().hash_value("ST12", scope="plate"), stored_hashes)

    def test_phone_fragment_hashes_cover_any_contiguous_four_plus_digits(self) -> None:
        stored_hashes = set(hash_phone_search_fragments("+70123456789"))

        self.assertEqual(len(stored_hashes), 36)
        for query in ("0123", "12345", "4567", "+7 (012) 345-67-89"):
            self.assertTrue(stored_hashes.intersection(hash_phone_fragment_lookup_candidates(query)), query)
        self.assertEqual(hash_phone_fragment_lookup_candidates("821"), [])
        self.assertNotIn("4567", stored_hashes)
        self.assertIn(get_blind_index_service().hash_value("4567", scope="phone_fragment"), stored_hashes)
        self.assertNotIn(get_blind_index_service().hash_value("4821", scope="phone"), stored_hashes)

    def test_order_search_tokenizer_preserves_meaningful_vehicle_and_phone_tokens(self) -> None:
        self.assertEqual(OrderRepository._tokenize_search_query("Mazda CX-5"), ["Mazda", "CX-5"])
        self.assertEqual(OrderRepository._tokenize_search_query("Иванов А123ВВ"), ["Иванов", "А123ВВ"])
        self.assertEqual(
            OrderRepository._tokenize_search_query("Иван +7 (000) 000-00-38"),
            ["Иван", "+7 (000) 000-00-38"],
        )

    def test_order_repository_combines_token_groups_with_and(self) -> None:
        session = RecordingSession()
        repository = OrderRepository(session)

        repository.search(
            name_query="Иван",
            phone_query=None,
            plate_query=None,
            vin_query=None,
            search_query="Иван 4821",
        )

        statement_sql = str(session.statement)
        self.assertIn(" AND ", statement_sql)
        self.assertIn("crm_clients.name_search_hashes", statement_sql)
        self.assertIn("phone_fragment_hashes", statement_sql)
        self.assertIn("crm_vehicles.brand", statement_sql)
        self.assertIn("crm_vehicles.model", statement_sql)
        self.assertIn("crm_car_brands", statement_sql)
        self.assertIn("crm_car_models", statement_sql)
        self.assertIn("normalized_name", statement_sql)

    def test_short_numeric_token_does_not_add_phone_fragment_predicate(self) -> None:
        session = RecordingSession()
        repository = OrderRepository(session)

        repository.search(
            name_query="Иван",
            phone_query=None,
            plate_query=None,
            vin_query=None,
            search_query="Иван 821",
        )

        self.assertNotIn("phone_fragment_hashes", str(session.statement))

    def test_one_character_token_does_not_add_plate_fragment_predicate(self) -> None:
        session = RecordingSession()
        repository = OrderRepository(session)

        repository.search(
            name_query="T",
            phone_query=None,
            plate_query=None,
            vin_query=None,
            search_query="T",
        )

        self.assertNotIn("plate_fragment_hashes", str(session.statement))
