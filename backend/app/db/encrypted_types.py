from __future__ import annotations

import json

from sqlalchemy.types import TEXT, TypeDecorator

from app.core.crypto import get_data_encryption_service


class EncryptedText(TypeDecorator):
    impl = TEXT
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return get_data_encryption_service().encrypt(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return get_data_encryption_service().decrypt(str(value))


class EncryptedJson(TypeDecorator):
    impl = TEXT
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return get_data_encryption_service().encrypt(payload)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        decrypted = get_data_encryption_service().decrypt(str(value))
        return json.loads(decrypted)
