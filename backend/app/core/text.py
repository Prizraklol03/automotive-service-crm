from __future__ import annotations

import re


_MOJIBAKE_SOURCE_ENCODINGS = ("cp1251", "cp1252")
_NON_ASCII_SPAN_RE = re.compile(r"[^\x00-\x7F]+")
_PLAUSIBLE_REPAIRED_TEXT_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁё\s,.:;#\-/()'\"!?%+=&№«»\[\]{}@_–—]+$")
_STATUS_CHANGE_TITLE_RE = re.compile(
    r"^(?:и)?змен[её]н\s+статус\s+заказа\s+#(?P<number>\d+)$",
    re.IGNORECASE,
)
_UPDATED_ORDER_TITLE_RE = re.compile(
    r"^обновл[её]н\s+заказ\s+#(?P<number>\d+)$",
    re.IGNORECASE,
)
_COMMON_CHARACTER_TRANSLATION = str.maketrans(
    {
        "\u0452": "\u0451",  # ђ -> ё
        "\u0402": "\u0401",  # Ђ -> Ё
    }
)


def _try_repair_from_encoding(text: str, source_encoding: str) -> str | None:
    try:
        repaired = text.encode(source_encoding).decode("utf-8")
    except UnicodeError:
        return None
    if repaired == text:
        return None
    return repaired


def _normalize_spacing(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    text = re.sub(r"\s+([:;])", r"\1", text)
    text = re.sub(r"\s+\.", ".", text)
    return text.strip()


def _count_cyrillic_uppercase(text: str) -> int:
    return sum(1 for char in text if "А" <= char <= "Я" or char == "Ё")


def _is_plausible_repair(candidate: str) -> bool:
    if not _PLAUSIBLE_REPAIRED_TEXT_RE.fullmatch(candidate):
        return False
    if candidate == candidate.upper() and any(char.isalpha() for char in candidate):
        return True
    cyrillic_uppercase = _count_cyrillic_uppercase(candidate)
    return cyrillic_uppercase <= 4


def _repair_common_problem_characters(text: str) -> str:
    repaired = text.translate(_COMMON_CHARACTER_TRANSLATION)
    return repaired


def _repair_token(text: str) -> str | None:
    for source_encoding in _MOJIBAKE_SOURCE_ENCODINGS:
        repaired = _try_repair_from_encoding(text, source_encoding)
        if repaired is not None and repaired != text and _is_plausible_repair(repaired):
            return repaired
    return None


def _collapse_repeated_prefix(text: str) -> str:
    candidate = text
    while candidate:
        changed = False
        for size in range(len(candidate) // 2, 0, -1):
            prefix = candidate[:size]
            if candidate[size : 2 * size] == prefix:
                candidate = prefix + candidate[2 * size :]
                changed = True
                break
        if not changed:
            return candidate
    return candidate


def _collapse_adjacent_duplicate_clauses(text: str) -> str:
    parts = [_normalize_spacing(part) for part in re.split(r"\s*,\s*", text) if _normalize_spacing(part)]
    if not parts:
        return text

    changed = True
    while changed and len(parts) > 1:
        changed = False
        for block_size in range(len(parts) // 2, 0, -1):
            index = 0
            while index + 2 * block_size <= len(parts):
                first_block = parts[index : index + block_size]
                second_block = parts[index + block_size : index + 2 * block_size]
                if first_block == second_block:
                    del parts[index + block_size : index + 2 * block_size]
                    changed = True
                else:
                    index += 1
            if changed:
                break

    collapsed = []
    for part in parts:
        collapsed_part = _collapse_repeated_prefix(part)
        collapsed.append(_normalize_spacing(collapsed_part))
    return ", ".join(part for part in collapsed if part)


def _repair_non_ascii_spans(text: str) -> str:
    changed = False

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        span = match.group(0)
        repaired = _repair_token(span)
        if repaired is not None and repaired != span:
            changed = True
            return repaired
        return span

    candidate = _NON_ASCII_SPAN_RE.sub(replace, text)
    if not changed:
        return text

    candidate = _normalize_spacing(candidate)
    candidate = _collapse_adjacent_duplicate_clauses(candidate)
    candidate = _collapse_repeated_prefix(candidate)
    return _normalize_spacing(candidate)


def _repair_status_change_title(text: str) -> str | None:
    stripped = _normalize_spacing(_repair_common_problem_characters(text))
    if not stripped:
        return None

    variants = [stripped]
    for offset in range(1, min(4, len(stripped))):
        variant = stripped[offset:].lstrip()
        if variant:
            variants.append(variant)

    for variant in variants:
        for source_encoding in _MOJIBAKE_SOURCE_ENCODINGS:
            repaired = _try_repair_from_encoding(variant, source_encoding)
            if repaired is None:
                continue
            normalized = _normalize_spacing(repaired)
            match = _STATUS_CHANGE_TITLE_RE.fullmatch(normalized.lower())
            if match:
                return f"Изменён статус заказа #{match.group('number')}"

    return None


def _repair_updated_order_title(text: str) -> str | None:
    stripped = _normalize_spacing(_repair_common_problem_characters(text))
    if not stripped:
        return None

    variants = [stripped]
    for offset in range(1, min(4, len(stripped))):
        variant = stripped[offset:].lstrip()
        if variant:
            variants.append(variant)

    for variant in variants:
        match = _UPDATED_ORDER_TITLE_RE.fullmatch(variant.lower())
        if match:
            return f"Обновлён заказ #{match.group('number')}"

    return None


def repair_mojibake_text(text: str | None) -> str | None:
    if text is None:
        return None

    order_title = _repair_updated_order_title(text)
    if order_title is not None:
        return order_title

    status_title = _repair_status_change_title(text)
    if status_title is not None:
        return status_title

    repaired = _repair_non_ascii_spans(text)
    if repaired != text:
        status_title = _repair_status_change_title(repaired)
        if status_title is not None:
            return status_title
        return repaired

    return text
