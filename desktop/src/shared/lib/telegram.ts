const TELEGRAM_USERNAME_BODY_PATTERN = /^[A-Za-z0-9_]{3,64}$/;

export function normalizeTelegramUsername(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const body = trimmed.replace(/^@+/, "").trim();
  if (!body) {
    return null;
  }

  return `@${body}`;
}

export function isValidTelegramUsername(value: string | null | undefined): boolean {
  const normalized = normalizeTelegramUsername(value);
  if (!normalized) {
    return true;
  }

  return TELEGRAM_USERNAME_BODY_PATTERN.test(normalized.slice(1));
}

export function formatTelegramUsername(value: string | null | undefined): string | null {
  const normalized = normalizeTelegramUsername(value);
  if (!normalized) {
    return null;
  }

  return isValidTelegramUsername(normalized) ? normalized : null;
}
