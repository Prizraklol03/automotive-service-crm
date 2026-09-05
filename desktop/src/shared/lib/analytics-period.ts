import { CRM_TIME_ZONE } from "@/shared/config/timezone";

export type AnalyticsPeriodPreset =
  | "today"
  | "yesterday"
  | "7_days"
  | "30_days"
  | "working_month"
  | "previous_working_month"
  | "quarter"
  | "custom";

export const ANALYTICS_PERIOD_PRESET_OPTIONS: Array<{ label: string; value: AnalyticsPeriodPreset }> = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "7_days", label: "7 дней" },
  { value: "30_days", label: "30 дней" },
  { value: "working_month", label: "Рабочий месяц" },
  { value: "previous_working_month", label: "Прошлый рабочий месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "custom", label: "Свой период" }
];

export type AnalyticsPeriodRange = {
  dateFrom: string;
  dateTo: string;
};

function getDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: CRM_TIME_ZONE,
    year: "numeric"
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    day: Number(map.day ?? "1"),
    month: Number(map.month ?? "1"),
    year: Number(map.year ?? "1970")
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function getPreviousMonth(year: number, month: number) {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }

  return { year, month: month - 1 };
}

function getNextMonth(year: number, month: number) {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }

  return { year, month: month + 1 };
}

function clampWorkingMonthStartDay(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return 25;
  }
  return Math.min(28, Math.max(1, Math.trunc(value ?? 25)));
}

export function getAnalyticsWorkingMonthRange(referenceDate = new Date(), workingMonthStartDay = 25): AnalyticsPeriodRange {
  return resolveAnalyticsPeriodRange("working_month", referenceDate, workingMonthStartDay);
}

export function resolveAnalyticsPeriodRange(
  preset: AnalyticsPeriodPreset,
  referenceDate = new Date(),
  workingMonthStartDay = 25
): AnalyticsPeriodRange {
  const startDay = clampWorkingMonthStartDay(workingMonthStartDay);
  const { day, month, year } = getDateParts(referenceDate);

  if (preset === "today") {
    const current = formatDate(year, month, day);
    return { dateFrom: current, dateTo: current };
  }

  if (preset === "yesterday") {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() - 1);
    const parts = getDateParts(date);
    const current = formatDate(parts.year, parts.month, parts.day);
    return { dateFrom: current, dateTo: current };
  }

  if (preset === "7_days" || preset === "30_days") {
    const days = preset === "7_days" ? 6 : 29;
    const to = new Date(referenceDate);
    const from = new Date(referenceDate);
    from.setDate(from.getDate() - days);
    const fromParts = getDateParts(from);
    const toParts = getDateParts(to);
    return {
      dateFrom: formatDate(fromParts.year, fromParts.month, fromParts.day),
      dateTo: formatDate(toParts.year, toParts.month, toParts.day)
    };
  }

  if (preset === "quarter") {
    const quarterIndex = Math.floor((month - 1) / 3);
    const quarterStartMonth = quarterIndex * 3 + 1;
    const start = formatDate(year, quarterStartMonth, 1);
    const nextQuarter = getNextMonth(year, quarterStartMonth + 2);
    const end = new Date(nextQuarter.year, nextQuarter.month - 1, 1);
    end.setDate(end.getDate() - 1);
    return {
      dateFrom: start,
      dateTo: formatDate(end.getFullYear(), end.getMonth() + 1, end.getDate())
    };
  }

  if (preset === "previous_working_month") {
    const currentWorkingMonth = resolveAnalyticsPeriodRange("working_month", referenceDate, startDay);
    const currentStartParts = currentWorkingMonth.dateFrom.split("-").map(Number);
    const currentStart = new Date(currentStartParts[0] ?? year, (currentStartParts[1] ?? month) - 1, currentStartParts[2] ?? startDay);
    const previousMonth = getPreviousMonth(currentStart.getFullYear(), currentStart.getMonth() + 1);
    const start = formatDate(previousMonth.year, previousMonth.month, startDay);
    const nextMonth = getNextMonth(previousMonth.year, previousMonth.month);
    const end = new Date(nextMonth.year, nextMonth.month - 1, startDay);
    end.setDate(end.getDate() - 1);
    return {
      dateFrom: start,
      dateTo: formatDate(end.getFullYear(), end.getMonth() + 1, end.getDate())
    };
  }

  const startMonth = day >= startDay ? { year, month } : getPreviousMonth(year, month);
  const endMonth = getNextMonth(startMonth.year, startMonth.month);
  const end = new Date(endMonth.year, endMonth.month - 1, startDay);
  end.setDate(end.getDate() - 1);

  return {
    dateFrom: formatDate(startMonth.year, startMonth.month, startDay),
    dateTo: formatDate(end.getFullYear(), end.getMonth() + 1, end.getDate())
  };
}
