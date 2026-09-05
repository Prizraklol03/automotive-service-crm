import { CRM_TIME_ZONE } from "@/shared/config/timezone";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getKrasnoyarskOffsetHours() {
  return 7;
}

function parseNaiveCrmDateTime(value: string) {
  const match = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second = "00"] = match;
  const utcMillis =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - getKrasnoyarskOffsetHours(),
      Number(minute),
      Number(second)
    );

  return new Date(utcMillis);
}

function getCrmDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: CRM_TIME_ZONE,
    year: "numeric"
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    day: map.day ?? "01",
    hour: map.hour ?? "00",
    minute: map.minute ?? "00",
    month: map.month ?? "01",
    year: map.year ?? "1970"
  };
}

export function toCrmDate(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim().replace(" ", "T");
  const hasExplicitTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);

  if (!hasExplicitTimezone) {
    return parseNaiveCrmDateTime(normalized);
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatCrmDateTimeValue(date: Date) {
  const parts = getCrmDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toLocalDateTimeInputValue(value: string | null) {
  if (!value) return "";

  const normalized = value.trim().replace(" ", "T");
  const hasExplicitTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);

  if (!hasExplicitTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) {
    return normalized.slice(0, 16);
  }

  const date = toCrmDate(normalized);
  if (!date) return "";
  return formatCrmDateTimeValue(date);
}

export function toApiLocalDateTime(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }

  const date = toCrmDate(normalized);
  if (!date) return null;
  return `${formatCrmDateTimeValue(date)}:00`;
}

export function getDefaultDateTimeValue() {
  const parts = getCrmDateParts(new Date());
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

export function formatCrmDateTime(value: string | null | undefined) {
  const date = toCrmDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CRM_TIME_ZONE
  }).format(date);
}
