const PHONE_DIGITS_RE = /\D/g;

function compactPhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(PHONE_DIGITS_RE, "");
}

function normalizeDigitsForRuPhone(value: string | null | undefined): string {
  let digits = compactPhoneDigits(value);
  if (!digits) {
    return "";
  }

  if (digits.startsWith("8") && digits.length >= 1) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.startsWith("9")) {
    digits = `7${digits}`;
  } else if (digits.length === 10 && !digits.startsWith("7")) {
    digits = `7${digits}`;
  }

  return digits.slice(0, 11);
}

export function getPhoneNationalDigits(value: string | null | undefined): string {
  const digits = normalizeDigitsForRuPhone(value);
  return digits.startsWith("7") ? digits.slice(1) : digits;
}

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  const digits = normalizeDigitsForRuPhone(value);
  if (!digits) {
    return null;
  }

  if (digits.length !== 11 || !digits.startsWith("7")) {
    return null;
  }

  return `+${digits}`;
}

export function isValidPhoneNumber(value: string | null | undefined): boolean {
  return normalizePhoneNumber(value) !== null;
}

export function formatPhoneNumber(value: string | null | undefined): string {
  const rawValue = (value ?? "").trim();
  if (rawValue === "+") {
    return "+";
  }

  if (rawValue.startsWith("+")) {
    const plusDigits = compactPhoneDigits(rawValue);
    if (plusDigits.length > 0 && plusDigits.length <= 10) {
      const national = plusDigits.startsWith("7") ? plusDigits.slice(1, 11) : plusDigits.slice(0, 10);
      let result = "+7";

      if (national.length > 0) {
        result += ` (${national.slice(0, 3)}`;
      }
      if (national.length >= 3) {
        result += ")";
      }
      if (national.length > 3) {
        result += ` ${national.slice(3, 6)}`;
      }
      if (national.length > 6) {
        result += `-${national.slice(6, 8)}`;
      }
      if (national.length > 8) {
        result += `-${national.slice(8, 10)}`;
      }

      return result;
    }
  }

  const digits = normalizeDigitsForRuPhone(value);
  if (!digits) {
    return "";
  }

  const national = digits.slice(1);
  let result = "+7";

  if (national.length > 0) {
    result += ` (${national.slice(0, 3)}`;
  }
  if (national.length >= 3) {
    result += ")";
  }
  if (national.length > 3) {
    result += ` ${national.slice(3, 6)}`;
  }
  if (national.length > 6) {
    result += `-${national.slice(6, 8)}`;
  }
  if (national.length > 8) {
    result += `-${national.slice(8, 10)}`;
  }

  return result;
}

export function formatPhoneDisplay(value: string | null | undefined): string | null {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) {
    return null;
  }

  return formatPhoneNumber(normalized);
}

export function getPhoneDigitsCountBeforeCursor(value: string, cursor: number): number {
  return value.slice(0, cursor).replace(PHONE_DIGITS_RE, "").length;
}

export function getCursorPositionForPhoneDigits(formattedValue: string, digitsCount: number): number {
  if (digitsCount <= 0) {
    return 0;
  }

  let seenDigits = 0;
  for (let index = 0; index < formattedValue.length; index += 1) {
    const character = formattedValue[index];
    if (character && /\d/.test(character)) {
      seenDigits += 1;
      if (seenDigits === digitsCount) {
        return index + 1;
      }
    }
  }

  return formattedValue.length;
}
