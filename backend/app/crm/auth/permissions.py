from __future__ import annotations

from typing import Final

from app.crm.models.user import CrmUser


ALL_PERMISSION_CODES: Final[tuple[str, ...]] = (
    "clients.view",
    "clients.create",
    "clients.edit",
    "vehicles.view",
    "vehicles.create",
    "vehicles.edit",
    "orders.view",
    "orders.create",
    "orders.edit",
    "orders.payments.create",
    "orders.payments.edit",
    "orders.payments.delete",
    "orders.change_prices",
    "orders.complete",
    "orders.documents",
    "personal_data.view",
    "personal_data.edit",
    "personal_data.export",
    "documents.view",
    "documents.download",
    "documents.generate",
    "photos.view",
    "photos.upload",
    "audit_logs.view",
    "materials.view",
    "materials.manage",
    "finance.view",
    "finance.expenses.create",
    "finance.expenses.edit_delete",
    "analytics.view",
    "settings.users.manage",
    "settings.catalog.manage",
)

DEFAULT_STANDARD_USER_PERMISSION_CODES: Final[set[str]] = {
    "clients.view",
    "clients.create",
    "clients.edit",
    "vehicles.view",
    "vehicles.create",
    "vehicles.edit",
    "orders.view",
    "orders.create",
    "orders.edit",
    "orders.change_prices",
    "orders.complete",
    "orders.documents",
    "personal_data.view",
    "personal_data.edit",
    "documents.view",
    "documents.download",
    "documents.generate",
    "photos.view",
    "photos.upload",
    "materials.view",
    "materials.manage",
    "finance.view",
    "finance.expenses.create",
}

ALL_PERMISSION_CODE_SET: Final[set[str]] = set(ALL_PERMISSION_CODES)


def validate_permission_code(permission_code: str) -> bool:
    return permission_code in ALL_PERMISSION_CODE_SET


def get_effective_permissions(user: CrmUser) -> set[str]:
    if user.role.code == "admin":
        return set(ALL_PERMISSION_CODES)

    effective_permissions = set(DEFAULT_STANDARD_USER_PERMISSION_CODES)
    for override in user.permissions:
        if override.permission_code not in ALL_PERMISSION_CODE_SET:
            continue
        if override.is_allowed:
            effective_permissions.add(override.permission_code)
        else:
            effective_permissions.discard(override.permission_code)
    return effective_permissions


def has_permission(user: CrmUser, permission_code: str) -> bool:
    if user.role.code == "admin":
        return True
    return permission_code in get_effective_permissions(user)


def has_any_permission(user: CrmUser, *permission_codes: str) -> bool:
    if user.role.code == "admin":
        return True
    effective = get_effective_permissions(user)
    return any(permission_code in effective for permission_code in permission_codes)
