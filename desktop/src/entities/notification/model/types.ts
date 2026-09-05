export type ReminderTargetType = "client" | "order" | "vehicle" | "standalone";
export type ReminderStatus = "active" | "postponed" | "done" | "expired";
export type NotificationsScope = "due" | "scheduled" | "history" | "all";

export type NotificationsSummary = {
  all: number;
  due: number;
  history: number;
  scheduled: number;
};

export type ReminderTargetSummary = {
  subtitle: string | null;
  target_id: number;
  target_type: ReminderTargetType;
  title: string;
};

export type NotificationItem = {
  completed_at: string | null;
  due_at: string;
  effective_status: string;
  id: number;
  is_overdue: boolean;
  postpone_until: string | null;
  reminder_id: number;
  repeat_rule: string | null;
  status: ReminderStatus;
  target_summary: ReminderTargetSummary;
  text: string;
};

export type Reminder = {
  completed_at: string | null;
  created_at: string;
  created_by_user_id: number;
  due_at: string;
  effective_status: string;
  id: number;
  is_overdue: boolean;
  postpone_until: string | null;
  repeat_rule: string | null;
  status: ReminderStatus;
  target_id: number;
  target_summary: ReminderTargetSummary;
  target_type: ReminderTargetType;
  text: string;
  updated_at: string;
};

export type ReminderCreatePayload = {
  due_at: string;
  repeat_rule: string | null;
  target_id: number | null;
  target_type: ReminderTargetType | null;
  text: string;
};

export type ReminderUpdatePayload = ReminderCreatePayload;

export type ReminderDonePayload = {
  completed_at: string | null;
};

export type ReminderPostponePayload = {
  postpone_until: string;
};

export type ReminderRepeatPayload = {
  repeat_rule: string | null;
};
