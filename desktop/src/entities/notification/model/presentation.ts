import { toCrmDate } from "@/shared/lib/datetime";
import type { NotificationItem, NotificationsScope, Reminder, ReminderStatus } from "@/entities/notification/model/types";

type ReminderLike = Pick<Reminder, "due_at" | "postpone_until" | "status"> & {
  completed_at?: string | null;
  effective_status?: string;
  is_overdue?: boolean;
};

export const REMINDER_STATUS_LABELS: Record<Exclude<ReminderStatus, "active"> | "active", string> = {
  active: "К исполнению",
  done: "Выполнено",
  expired: "Просрочено",
  postponed: "Запланировано"
};

export const REMINDER_REPEAT_OPTIONS = [
  { label: "Без повтора", value: "" },
  { label: "Каждый день", value: "every_day" },
  { label: "Каждую неделю", value: "every_week" },
  { label: "Каждый месяц", value: "every_month" }
] as const;

export type ReminderRepeatOptionValue = (typeof REMINDER_REPEAT_OPTIONS)[number]["value"];

type EffectiveReminderStatus = ReminderStatus | "overdue";

function resolveEffectiveStatus(status: ReminderStatus | string, reminder?: ReminderLike): EffectiveReminderStatus {
  if (status === "done" || status === "expired" || status === "postponed") {
    return status;
  }

  if (reminder?.effective_status === "done" || reminder?.effective_status === "expired" || reminder?.effective_status === "postponed") {
    return reminder.effective_status;
  }

  if (reminder?.effective_status === "overdue") {
    return "overdue";
  }

  if (reminder?.is_overdue) {
    return "overdue";
  }

  const compareValue = reminder?.postpone_until ?? reminder?.due_at ?? null;
  const compareDate = toCrmDate(compareValue);
  if (compareDate && compareDate.getTime() > Date.now()) {
    return "postponed";
  }

  return "active";
}

export function getNotificationsScopeLabel(scope: NotificationsScope) {
  switch (scope) {
    case "scheduled":
      return "Запланированные";
    case "history":
      return "История";
    case "all":
      return "Все";
    default:
      return "К исполнению";
  }
}

export function getNotificationsScopeDescription(scope: NotificationsScope) {
  switch (scope) {
    case "scheduled":
      return "То, что запланировано на будущее.";
    case "history":
      return "Выполненные и удалённые напоминания.";
    case "all":
      return "Все напоминания в одном списке.";
    default:
      return "То, что требует внимания сейчас.";
  }
}

export function getReminderStatusLabel(status: ReminderStatus | string, reminder?: ReminderLike, _scope?: NotificationsScope) {
  const effectiveStatus = resolveEffectiveStatus(status, reminder);

  switch (effectiveStatus) {
    case "done":
    case "expired":
    case "postponed":
      return REMINDER_STATUS_LABELS[effectiveStatus];
    case "overdue":
    case "active":
    default:
      return "К исполнению";
  }
}

export function getReminderStatusTone(status: ReminderStatus | string, _scope?: NotificationsScope, reminder?: ReminderLike) {
  const effectiveStatus = resolveEffectiveStatus(status, reminder);

  switch (effectiveStatus) {
    case "done":
      return "success" as const;
    case "expired":
      return "warning" as const;
    case "postponed":
      return "muted" as const;
    case "overdue":
    case "active":
    default:
      return "warning" as const;
  }
}

export function getReminderSecondaryLine(
  notification: NotificationItem,
  scope: NotificationsScope,
  formatDateTime: (value: string | null) => string
) {
  if (scope === "history") {
    if (notification.completed_at) {
      return `Завершено: ${formatDateTime(notification.completed_at)}`;
    }

    return "Просрочено";
  }

  if (resolveEffectiveStatus(notification.status, notification) === "postponed") {
    return `Запланировано на ${formatDateTime(notification.postpone_until ?? notification.due_at)}`;
  }

  return `Срок: ${formatDateTime(notification.postpone_until ?? notification.due_at)}`;
}

export function normalizeReminderRepeatRule(value: string | null | undefined): ReminderRepeatOptionValue {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "";
  }

  if (
    normalized === "every_day" ||
    normalized.startsWith("every_day_") ||
    normalized === "daily" ||
    normalized.includes("ежеднев")
  ) {
    return "every_day";
  }

  if (
    normalized === "every_week" ||
    normalized.startsWith("every_week_") ||
    normalized === "weekly" ||
    normalized.includes("каждую неделю")
  ) {
    return "every_week";
  }

  if (
    normalized === "every_month" ||
    normalized.startsWith("every_month_") ||
    normalized === "monthly" ||
    normalized.includes("каждый месяц")
  ) {
    return "every_month";
  }

  return "";
}

export function getReminderRepeatLabel(value: string | null | undefined) {
  const normalized = normalizeReminderRepeatRule(value);
  return REMINDER_REPEAT_OPTIONS.find((option) => option.value === normalized)?.label ?? "Без повтора";
}
