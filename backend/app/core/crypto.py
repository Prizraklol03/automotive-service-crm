from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Final

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings
from app.core.errors import AppError

_VERSION_SEPARATOR: Final[str] = "$"
_AAD_PREFIX: Final[bytes] = b"crm:v1:"
_NONCE_SIZE: Final[int] = 12
_MIN_KEY_BYTES: Final[int] = 32
_BLIND_INDEX_KEY_ID: Final[str] = "v1"


def _decode_key(raw_value: str, *, field_name: str) -> bytes:
    value = raw_value.strip()
    if not value:
        raise RuntimeError(f"{field_name} must not be empty")

    candidates = [value]
    padding = "=" * (-len(value) % 4)
    if padding:
        candidates.append(value + padding)

    for candidate in candidates:
        try:
            decoded = base64.urlsafe_b64decode(candidate.encode("ascii"))
        except Exception:
            continue
        if len(decoded) >= _MIN_KEY_BYTES:
            return decoded

    raise RuntimeError(f"{field_name} must be a base64url-encoded key with at least {_MIN_KEY_BYTES} bytes")


def _build_aad(scope: str, key_id: str) -> bytes:
    return _AAD_PREFIX + f"{scope}:{key_id}".encode("utf-8")


@dataclass(frozen=True, slots=True)
class KeyDescriptor:
    key_id: str
    key_bytes: bytes


class AeadEncryptionService:
    def __init__(self, *, scope: str, key: KeyDescriptor) -> None:
        self.scope = scope
        self.key = key
        self._cipher = AESGCM(key.key_bytes)

    def encrypt(self, plaintext: str | None) -> str | None:
        if plaintext is None:
            return None
        nonce = os.urandom(_NONCE_SIZE)
        ciphertext = self._cipher.encrypt(nonce, plaintext.encode("utf-8"), _build_aad(self.scope, self.key.key_id))
        return _VERSION_SEPARATOR.join(
            [
                self.key.key_id,
                base64.urlsafe_b64encode(nonce).decode("ascii").rstrip("="),
                base64.urlsafe_b64encode(ciphertext).decode("ascii").rstrip("="),
            ]
        )

    def decrypt(self, ciphertext: str | None) -> str | None:
        if ciphertext is None:
            return None
        if _VERSION_SEPARATOR not in ciphertext:
            return ciphertext
        try:
            key_id, nonce_part, payload_part = ciphertext.split(_VERSION_SEPARATOR, 2)
        except ValueError as exc:
            raise AppError(code="security_error", message="Corrupted encrypted payload", status_code=500) from exc
        if key_id != self.key.key_id:
            raise AppError(code="security_error", message="Unknown encryption key version", status_code=500)

        nonce = base64.urlsafe_b64decode(nonce_part + "=" * (-len(nonce_part) % 4))
        payload = base64.urlsafe_b64decode(payload_part + "=" * (-len(payload_part) % 4))
        plaintext = self._cipher.decrypt(nonce, payload, _build_aad(self.scope, key_id))
        return plaintext.decode("utf-8")


class BlindIndexService:
    def __init__(self, key: KeyDescriptor) -> None:
        self.key = key

    def hash_value(self, value: str | None, *, scope: str) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        digest = hmac.new(self.key.key_bytes, f"{scope}:{normalized}".encode("utf-8"), hashlib.sha256).hexdigest()
        return digest


class JsonSealingService:
    def __init__(self, *, encryption_service: AeadEncryptionService) -> None:
        self.encryption_service = encryption_service

    def encrypt_json(self, payload: dict | list | None) -> str | None:
        if payload is None:
            return None
        return self.encryption_service.encrypt(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    def decrypt_json(self, payload: str | None) -> dict | list | None:
        decrypted = self.encryption_service.decrypt(payload)
        if decrypted is None:
            return None
        return json.loads(decrypted)


@lru_cache
def get_data_encryption_service() -> AeadEncryptionService:
    settings = get_settings()
    return AeadEncryptionService(
        scope="data",
        key=KeyDescriptor(
            key_id=settings.crm_data_encryption_key_id,
            key_bytes=_decode_key(settings.crm_data_encryption_key, field_name="CRM_DATA_ENCRYPTION_KEY"),
        ),
    )


@lru_cache
def get_file_encryption_service() -> AeadEncryptionService:
    settings = get_settings()
    raw_key = settings.crm_file_encryption_key or settings.crm_data_encryption_key
    key_id = settings.crm_file_encryption_key_id or settings.crm_data_encryption_key_id
    return AeadEncryptionService(
        scope="file",
        key=KeyDescriptor(
            key_id=key_id,
            key_bytes=_decode_key(raw_key, field_name="CRM_FILE_ENCRYPTION_KEY"),
        ),
    )


@lru_cache
def get_blind_index_service() -> BlindIndexService:
    settings = get_settings()
    return BlindIndexService(
        KeyDescriptor(
            key_id=_BLIND_INDEX_KEY_ID,
            key_bytes=_decode_key(settings.crm_data_hash_key, field_name="CRM_DATA_HASH_KEY"),
        )
    )
