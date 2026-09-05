from __future__ import annotations

from typing import Any

from app.core.privacy import mask_email, mask_name, mask_phone, mask_plate, mask_vin


class PersonalDataMaskingService:
    @staticmethod
    def can_view_personal_data(*, permissions: set[str], role_code: str) -> bool:
        return role_code == "admin" or "personal_data.view" in permissions

    @staticmethod
    def mask_client_payload(payload: dict[str, Any]) -> dict[str, Any]:
        payload = dict(payload)
        payload["full_name"] = mask_name(payload.get("full_name"))
        payload["phone_display"] = mask_phone(payload.get("phone_display"))
        payload["phone_normalized"] = mask_phone(payload.get("phone_normalized"))
        if payload.get("display_label"):
            payload["display_label"] = mask_name(payload.get("display_label"))
        if payload.get("representative_full_name"):
            payload["representative_full_name"] = mask_name(payload.get("representative_full_name"))
        for field in ("address", "legal_address", "actual_address", "telegram_username"):
            if field in payload:
                payload[field] = None
        if "email" in payload:
            payload["email"] = mask_email(payload.get("email"))
        return payload

    @staticmethod
    def mask_vehicle_payload(payload: dict[str, Any]) -> dict[str, Any]:
        payload = dict(payload)
        payload["plate_number_display"] = mask_plate(payload.get("plate_number_display"))
        payload["plate_number_normalized"] = mask_plate(payload.get("plate_number_normalized"))
        payload["vin"] = mask_vin(payload.get("vin"))
        if "display_name" in payload:
            payload["display_name"] = mask_plate(payload.get("plate_number_display")) or "***"
        return payload

    @staticmethod
    def mask_order_summary_payload(payload: dict[str, Any]) -> dict[str, Any]:
        payload = dict(payload)
        payload["client_full_name"] = mask_name(payload.get("client_full_name"))
        payload["client_phone"] = mask_phone(payload.get("client_phone"))
        payload["vehicle_plate_number"] = mask_plate(payload.get("vehicle_plate_number"))
        payload["vehicle_vin"] = mask_vin(payload.get("vehicle_vin"))
        return payload

    @classmethod
    def project_client(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        return dict(payload) if can_view_personal else cls.mask_client_payload(payload)

    @classmethod
    def project_vehicle(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        return dict(payload) if can_view_personal else cls.mask_vehicle_payload(payload)

    @classmethod
    def project_order_summary(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        return dict(payload) if can_view_personal else cls.mask_order_summary_payload(payload)

    @classmethod
    def project_order_detail(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        payload = dict(payload)
        if can_view_personal:
            return payload
        client_summary = payload.get("client_summary")
        if isinstance(client_summary, dict):
            payload["client_summary"] = cls.mask_client_payload(client_summary)
        vehicle_summary = payload.get("vehicle_summary")
        if isinstance(vehicle_summary, dict):
            payload["vehicle_summary"] = cls.mask_vehicle_payload(vehicle_summary)
        return payload

    @classmethod
    def project_client_detail(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        payload = cls.project_client(payload, can_view_personal=can_view_personal)
        if can_view_personal:
            return payload
        payload["orders"] = [
            cls.mask_order_summary_payload(order) for order in payload.get("orders", [])
        ]
        return payload

    @classmethod
    def project_vehicle_detail(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        payload = cls.project_vehicle(payload, can_view_personal=can_view_personal)
        if can_view_personal:
            return payload
        payload["current_owner_full_name"] = mask_name(payload.get("current_owner_full_name"))
        payload["current_owner_phone_display"] = mask_phone(payload.get("current_owner_phone_display"))
        payload["orders"] = [
            cls.mask_order_summary_payload(order) for order in payload.get("orders", [])
        ]
        payload["owner_history"] = [
            {
                **entry,
                "client_full_name": mask_name(entry.get("client_full_name")),
                "title": "Владелец",
            }
            for entry in payload.get("owner_history", [])
        ]
        return payload

    @classmethod
    def project_client_summary(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        return dict(payload) if can_view_personal else {
            **payload,
            "full_name": mask_name(payload.get("full_name")),
            "phone_display": mask_phone(payload.get("phone_display")),
        }

    @classmethod
    def project_vehicle_summary(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        return dict(payload) if can_view_personal else {
            **payload,
            "plate_number_display": mask_plate(payload.get("plate_number_display")),
        }

    @classmethod
    def project_order_history(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        payload = dict(payload)
        if not can_view_personal:
            payload["orders"] = [cls.mask_order_summary_payload(order) for order in payload.get("orders", [])]
        return payload

    @classmethod
    def project_service_history(cls, payload: dict[str, Any], *, can_view_personal: bool) -> dict[str, Any]:
        payload = dict(payload)
        if not can_view_personal:
            payload["services"] = [
                {
                    **entry,
                    "client_full_name": mask_name(entry.get("client_full_name")),
                    "vehicle_plate_number": mask_plate(entry.get("vehicle_plate_number")),
                }
                for entry in payload.get("services", [])
            ]
        return payload
