from __future__ import annotations

import re

from app.core.crypto import get_blind_index_service
from app.crm.utils.normalization import build_plate_search_candidates, normalize_phone_search_query

MIN_PHONE_FRAGMENT_LENGTH = 4
MIN_PLATE_FRAGMENT_LENGTH = 2

NAME_TOKEN_SPLIT_RE = re.compile(r"[^0-9a-zA-Zа-яА-ЯёЁ]+")


def normalize_email_for_hash(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def normalize_plate_for_hash(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = "".join(character for character in value.upper() if character.isalnum())
    return normalized or None


def normalize_vin_for_hash(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = "".join(character for character in value.upper() if character.isalnum())
    return normalized or None


def mask_name(value: str | None) -> str | None:
    if not value:
        return value
    parts = [part for part in value.split() if part]
    if not parts:
        return value
    return " ".join(part[:1] + "*" * max(len(part) - 1, 0) for part in parts)


def mask_phone(value: str | None) -> str | None:
    if not value:
        return value
    digits = [character for character in value if character.isdigit()]
    if len(digits) < 4:
        return "*" * len(value)
    tail = "".join(digits[-4:])
    return f"*** *** {tail}"


def mask_email(value: str | None) -> str | None:
    if not value or "@" not in value:
        return value
    local_part, domain = value.split("@", 1)
    if len(local_part) <= 1:
        masked_local = "*"
    else:
        masked_local = local_part[:1] + "*" * (len(local_part) - 1)
    return f"{masked_local}@{domain}"


def mask_plate(value: str | None) -> str | None:
    if not value:
        return value
    if len(value) <= 3:
        return "*" * len(value)
    return value[:2] + "*" * max(len(value) - 4, 0) + value[-2:]


def mask_vin(value: str | None) -> str | None:
    if not value:
        return value
    if len(value) <= 6:
        return "*" * len(value)
    return value[:3] + "*" * (len(value) - 6) + value[-3:]


def hash_phone_lookup(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = normalize_phone_search_query(value)
    if len(normalized) == 11 and normalized.startswith("7"):
        normalized = f"+{normalized}"
    elif not normalized:
        normalized = value.strip() or None
    return get_blind_index_service().hash_value(normalized, scope="phone")


def normalize_phone_search_fragments(value: str | None) -> list[str]:
    if value is None:
        return []
    digits = normalize_phone_search_query(value)
    if len(digits) < MIN_PHONE_FRAGMENT_LENGTH:
        return []
    return sorted(
        {
            digits[start:end]
            for start in range(len(digits))
            for end in range(start + MIN_PHONE_FRAGMENT_LENGTH, len(digits) + 1)
        }
    )


def hash_phone_search_fragments(value: str | None) -> list[str]:
    service = get_blind_index_service()
    return [
        hashed
        for hashed in (
            service.hash_value(fragment, scope="phone_fragment")
            for fragment in normalize_phone_search_fragments(value)
        )
        if hashed is not None
    ]


def hash_phone_fragment_lookup_candidates(value: str | None) -> list[str]:
    if value is None:
        return []
    raw_digits = "".join(character for character in value if character.isdigit())
    if len(raw_digits) < MIN_PHONE_FRAGMENT_LENGTH:
        return []

    candidates = {raw_digits}
    normalized = normalize_phone_search_query(value)
    if len(normalized) >= MIN_PHONE_FRAGMENT_LENGTH:
        candidates.add(normalized)

    service = get_blind_index_service()
    return [
        hashed
        for hashed in (
            service.hash_value(candidate, scope="phone_fragment")
            for candidate in sorted(candidates)
        )
        if hashed is not None
    ]


def hash_email_lookup(value: str | None) -> str | None:
    return get_blind_index_service().hash_value(normalize_email_for_hash(value), scope="email")


def hash_plate_lookup(value: str | None) -> str | None:
    return get_blind_index_service().hash_value(normalize_plate_for_hash(value), scope="plate")


def normalize_plate_search_fragments(value: str | None) -> list[str]:
    candidates = build_plate_search_candidates(value)
    return sorted(
        {
            candidate[start:end]
            for candidate in candidates
            for start in range(len(candidate))
            for end in range(start + MIN_PLATE_FRAGMENT_LENGTH, len(candidate) + 1)
        }
    )


def hash_plate_search_fragments(value: str | None) -> list[str]:
    service = get_blind_index_service()
    return [
        hashed
        for hashed in (
            service.hash_value(fragment, scope="plate_fragment")
            for fragment in normalize_plate_search_fragments(value)
        )
        if hashed is not None
    ]


def hash_plate_fragment_lookup_candidates(value: str | None) -> list[str]:
    candidates = [
        candidate
        for candidate in build_plate_search_candidates(value)
        if len(candidate) >= MIN_PLATE_FRAGMENT_LENGTH
    ]
    service = get_blind_index_service()
    return [
        hashed
        for hashed in (
            service.hash_value(candidate, scope="plate_fragment")
            for candidate in candidates
        )
        if hashed is not None
    ]


def hash_vin_lookup(value: str | None) -> str | None:
    return get_blind_index_service().hash_value(normalize_vin_for_hash(value), scope="vin")


def normalize_name_search_tokens(*values: str | None) -> list[str]:
    tokens: set[str] = set()
    for value in values:
        if value is None:
            continue
        for raw_part in NAME_TOKEN_SPLIT_RE.split(value.casefold()):
            normalized = "".join(character for character in raw_part if character.isalnum())
            if len(normalized) < 3:
                continue
            for length in range(3, len(normalized) + 1):
                tokens.add(normalized[:length])
    return sorted(tokens)


def hash_name_lookup_tokens(*values: str | None) -> list[str]:
    service = get_blind_index_service()
    return [
        hashed
        for hashed in (service.hash_value(token, scope="client_name") for token in normalize_name_search_tokens(*values))
        if hashed is not None
    ]
