from __future__ import annotations

import re

from app.core.errors import AppError

PHONE_DIGITS_RE = re.compile(r"\D")
TELEGRAM_USERNAME_BODY_RE = re.compile(r"[A-Za-z0-9_]{3,64}")
REFERENCE_SPACE_RE = re.compile(r"\s+")
REFERENCE_BRAND_LOOKUP_RE = re.compile(r"[^a-z0-9]+")
REFERENCE_MODEL_LOOKUP_RE = re.compile(r"[^a-z0-9#+.\-]+")
NON_ALPHANUMERIC_RE = re.compile(r"[^0-9A-ZА-ЯЁ]+", re.IGNORECASE)

PLATE_HOMOGLYPH_TO_LATIN = str.maketrans(
    {"А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X"}
)
PLATE_HOMOGLYPH_TO_CYRILLIC = str.maketrans(
    {"A": "А", "B": "В", "E": "Е", "K": "К", "M": "М", "H": "Н", "O": "О", "P": "Р", "C": "С", "T": "Т", "Y": "У", "X": "Х"}
)
VIN_SAFE_CYRILLIC_TO_LATIN = PLATE_HOMOGLYPH_TO_LATIN

BRAND_ALIAS_MAP = {
    "mercedesbenz": "mercedesbenz",
    "mercedes": "mercedesbenz",
}


def normalize_phone(phone: str) -> str:
    digits = PHONE_DIGITS_RE.sub("", phone)
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    if len(digits) != 11 or not digits.startswith("7"):
        raise AppError(
            code="validation_error",
            message="Некорректный номер телефона",
            status_code=422,
            details={"field": "phone"},
        )
    return f"+{digits}"


def normalize_phone_search_query(query: str) -> str:
    digits = PHONE_DIGITS_RE.sub("", query)
    if len(digits) == 11 and digits.startswith("8"):
        return "7" + digits[1:]
    if len(digits) == 10:
        return "7" + digits
    return digits


def _normalize_alphanumeric_text(value: str) -> str:
    return "".join(character for character in value.strip().upper() if character.isalnum())


def normalize_plate_number(plate_number: str) -> str:
    normalized = _normalize_alphanumeric_text(plate_number)
    if not normalized:
        raise AppError(
            code="validation_error",
            message="Укажите госномер",
            status_code=422,
            details={"field": "plate_number"},
        )
    return normalized


def normalize_plate_search_query(query: str) -> str:
    return NON_ALPHANUMERIC_RE.sub("", query.strip().upper())


def normalize_vin_search_query(query: str) -> str:
    return normalize_plate_search_query(query).translate(VIN_SAFE_CYRILLIC_TO_LATIN)


def build_plate_search_candidates(query: str | None) -> list[str]:
    normalized = normalize_plate_search_query(query or "")
    if not normalized:
        return []
    return sorted(
        {
            normalized,
            normalized.translate(PLATE_HOMOGLYPH_TO_LATIN),
            normalized.translate(PLATE_HOMOGLYPH_TO_CYRILLIC),
        }
    )


def build_vin_search_candidates(query: str | None) -> list[str]:
    raw = normalize_plate_search_query(query or "")
    normalized = normalize_vin_search_query(query or "")
    return sorted(candidate for candidate in {raw, normalized} if candidate)


def normalize_upper_text(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    return normalized.upper()


def normalize_telegram_username(username: str | None) -> str | None:
    if username is None:
        return None

    normalized = username.strip()
    if not normalized:
        return None

    body = normalized.lstrip("@").strip()
    if not body:
        return None

    if not TELEGRAM_USERNAME_BODY_RE.fullmatch(body):
        raise AppError(
            code="validation_error",
            message="Некорректный username в Telegram",
            status_code=422,
            details={"field": "telegram_username"},
        )
    return f"@{body}"


def canonicalize_reference_name(value: str) -> str:
    cleaned = REFERENCE_SPACE_RE.sub(" ", value.strip())
    if not cleaned:
        raise AppError(
            code="validation_error",
            message="Укажите название справочника",
            status_code=422,
        )
    return cleaned


def normalize_reference_lookup_key(value: str, *, entity: str) -> str:
    cleaned = canonicalize_reference_name(value).casefold()
    if entity == "brand":
        key = REFERENCE_BRAND_LOOKUP_RE.sub("", cleaned)
        return BRAND_ALIAS_MAP.get(key, key)
    if entity == "model":
        return REFERENCE_MODEL_LOOKUP_RE.sub("", cleaned)
    raise ValueError(f"Unsupported reference normalization entity: {entity}")
