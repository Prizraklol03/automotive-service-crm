from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.crm.services.personal_data_service import PersonalDataMaskingService


MARKER = "PII_MARKER_4242"


class PersonalDataProjectionTestCase(unittest.TestCase):
    def assert_masked(self, payload: dict) -> None:
        self.assertNotIn(MARKER, json.dumps(payload, ensure_ascii=True))

    def test_permission_decision_is_centralized(self) -> None:
        self.assertFalse(PersonalDataMaskingService.can_view_personal_data(permissions={"orders.view"}, role_code="standard_user"))
        self.assertTrue(PersonalDataMaskingService.can_view_personal_data(permissions={"personal_data.view"}, role_code="standard_user"))
        self.assertTrue(PersonalDataMaskingService.can_view_personal_data(permissions=set(), role_code="admin"))

    def test_client_projections_mask_list_detail_summary_and_order_history(self) -> None:
        client = {
            "full_name": MARKER,
            "phone_display": f"+7{MARKER}",
            "phone_normalized": f"+7{MARKER}",
            "address": MARKER,
            "legal_address": MARKER,
            "actual_address": MARKER,
            "representative_full_name": MARKER,
            "telegram_username": MARKER,
            "display_label": MARKER,
        }
        order = {
            "client_full_name": MARKER,
            "client_phone": f"+7{MARKER}",
            "vehicle_plate_number": MARKER,
            "vehicle_vin": MARKER,
        }
        self.assert_masked(PersonalDataMaskingService.project_client(client, can_view_personal=False))
        self.assert_masked(PersonalDataMaskingService.project_client_detail({**client, "orders": [order]}, can_view_personal=False))
        self.assert_masked(PersonalDataMaskingService.project_client_summary({"full_name": MARKER, "phone_display": MARKER}, can_view_personal=False))
        self.assert_masked(PersonalDataMaskingService.project_order_history({"orders": [order]}, can_view_personal=False))
        self.assertIn(MARKER, json.dumps(PersonalDataMaskingService.project_client_detail({**client, "orders": [order]}, can_view_personal=True)))

    def test_vehicle_and_order_projections_mask_nested_and_history_paths(self) -> None:
        vehicle = {
            "plate_number_display": MARKER,
            "plate_number_normalized": MARKER,
            "vin": MARKER,
            "display_name": MARKER,
        }
        order = {
            "client_full_name": MARKER,
            "client_phone": MARKER,
            "vehicle_plate_number": MARKER,
            "vehicle_vin": MARKER,
        }
        detail = {
            **vehicle,
            "current_owner_full_name": MARKER,
            "current_owner_phone_display": MARKER,
            "orders": [order],
            "owner_history": [{"client_full_name": MARKER, "title": MARKER}],
        }
        order_detail = {
            "client_summary": {"full_name": MARKER, "phone_display": MARKER},
            "vehicle_summary": vehicle,
        }
        history = {"services": [{"client_full_name": MARKER, "vehicle_plate_number": MARKER}]}
        self.assert_masked(PersonalDataMaskingService.project_vehicle(vehicle, can_view_personal=False))
        self.assert_masked(PersonalDataMaskingService.project_vehicle_detail(detail, can_view_personal=False))
        self.assert_masked(
            PersonalDataMaskingService.project_vehicle_summary({"plate_number_display": MARKER}, can_view_personal=False)
        )
        self.assert_masked(PersonalDataMaskingService.project_order_summary(order, can_view_personal=False))
        self.assert_masked(PersonalDataMaskingService.project_order_detail(order_detail, can_view_personal=False))
        self.assert_masked(PersonalDataMaskingService.project_service_history(history, can_view_personal=False))
        self.assertIn(MARKER, json.dumps(PersonalDataMaskingService.project_order_detail(order_detail, can_view_personal=True)))


if __name__ == "__main__":
    unittest.main()
