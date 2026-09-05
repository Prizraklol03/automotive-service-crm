from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Final

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from app.core.config import is_non_production_environment
from app.core.crypto import KeyDescriptor, get_blind_index_service, get_data_encryption_service

DATA_ENCRYPTION_IDENTITY_SETTING: Final[str] = "security.data_encryption_key_identity"
BLIND_INDEX_IDENTITY_SETTING: Final[str] = "security.blind_index_key_identity"
_IDENTITY_VERSION: Final[int] = 1
_IDENTITY_CONTEXT: Final[bytes] = b"crm:key-identity:v1:"


@dataclass(frozen=True, slots=True)
class PersistedKeyIdentity:
    setting_key: str
    variable_name: str
    purpose: str
    key_id: str
    verifier: str

    def serialize(self) -> str:
        return json.dumps(
            {
                "key_id": self.key_id,
                "purpose": self.purpose,
                "verifier": self.verifier,
                "version": _IDENTITY_VERSION,
            },
            sort_keys=True,
            separators=(",", ":"),
        )


def _build_identity(
    *,
    setting_key: str,
    variable_name: str,
    purpose: str,
    key: KeyDescriptor,
) -> PersistedKeyIdentity:
    context = _IDENTITY_CONTEXT + f"{purpose}:{key.key_id}".encode("utf-8")
    verifier = hmac.new(key.key_bytes, context, hashlib.sha256).hexdigest()
    return PersistedKeyIdentity(
        setting_key=setting_key,
        variable_name=variable_name,
        purpose=purpose,
        key_id=key.key_id,
        verifier=verifier,
    )


def get_configured_key_identities() -> tuple[PersistedKeyIdentity, PersistedKeyIdentity]:
    data_encryption = get_data_encryption_service()
    blind_index = get_blind_index_service()
    return (
        _build_identity(
            setting_key=DATA_ENCRYPTION_IDENTITY_SETTING,
            variable_name="CRM_DATA_ENCRYPTION_KEY",
            purpose="data-encryption",
            key=data_encryption.key,
        ),
        _build_identity(
            setting_key=BLIND_INDEX_IDENTITY_SETTING,
            variable_name="CRM_DATA_HASH_KEY",
            purpose="blind-index",
            key=blind_index.key,
        ),
    )


def _raise_identity_error(identity: PersistedKeyIdentity, reason: str) -> None:
    raise RuntimeError(f"Persistent key identity validation failed for {identity.variable_name}: {reason}")


def record_configured_key_identities(connection: Connection) -> None:
    """Record immutable non-secret verifiers in the current transaction."""

    for identity in get_configured_key_identities():
        persisted = connection.execute(
            sa.text("SELECT value FROM crm_settings WHERE key = :key FOR UPDATE"),
            {"key": identity.setting_key},
        ).scalar_one_or_none()
        expected = identity.serialize()
        if persisted is None:
            connection.execute(
                sa.text("INSERT INTO crm_settings (key, value) VALUES (:key, :value)"),
                {"key": identity.setting_key, "value": expected},
            )
            continue
        if not hmac.compare_digest(str(persisted), expected):
            _raise_identity_error(identity, "configured key material does not match the existing key ID")


def validate_configured_key_identities(connection: Connection) -> None:
    """Require both persisted identities without registering or changing them."""

    for identity in get_configured_key_identities():
        persisted = connection.execute(
            sa.text("SELECT value FROM crm_settings WHERE key = :key"),
            {"key": identity.setting_key},
        ).scalar_one_or_none()
        if persisted is None:
            _raise_identity_error(identity, "identity is missing; run the approved migrations before startup")
        if not hmac.compare_digest(str(persisted), identity.serialize()):
            _raise_identity_error(identity, "configured key material does not match the existing key ID")


def validate_runtime_key_identities(connection: Connection | None, *, app_env: str) -> None:
    if is_non_production_environment(app_env):
        return
    if connection is None:
        raise RuntimeError("Persistent key identity validation requires a database connection")
    validate_configured_key_identities(connection)
