import { formatCrmDateTime } from "@/shared/lib/datetime";

export function formatCurrency(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Не указано";
  }

  return formatCrmDateTime(value) ?? value;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Не указано";
  }

  return value.split("-").reverse().join(".");
}

export function formatNumber(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("ru-RU").format(Number.isFinite(amount) ? amount : 0);
}
