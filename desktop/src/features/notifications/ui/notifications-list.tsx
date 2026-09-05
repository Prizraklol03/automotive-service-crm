import {
  getReminderRepeatLabel,
  getReminderSecondaryLine,
  getReminderStatusLabel,
  getReminderStatusTone
} from "@/entities/notification/model/presentation";
import type { NotificationItem, NotificationsScope } from "@/entities/notification/model/types";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

export function NotificationsList({
  isMobile,
  notifications,
  onOpenReminder,
  scope,
  selectedReminderId
}: {
  isMobile: boolean;
  notifications: NotificationItem[];
  onOpenReminder: (reminderId: number) => void;
  scope: NotificationsScope;
  selectedReminderId: number | null;
}) {
  if (!notifications.length) {
    return <EmptyState title="Напоминаний нет" description="Создайте новое напоминание или переключитесь на другой раздел." />;
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => {
        const statusLabel = getReminderStatusLabel(notification.status, notification, scope);
        const statusTone = getReminderStatusTone(notification.status, scope, notification);

        return (
          <button
            key={notification.id}
            type="button"
            onClick={() => onOpenReminder(notification.reminder_id)}
            className={cn(
              "w-full rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2/80",
              selectedReminderId === notification.reminder_id && "border-accent/60 bg-surface-2"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-foreground">{notification.text}</div>
                <div className="mt-2 text-sm text-muted-foreground">{notification.target_summary.title}</div>
                {notification.target_summary.subtitle ? (
                  <div className="mt-1 text-xs text-muted-foreground">{notification.target_summary.subtitle}</div>
                ) : null}
              </div>
              <StatusBadge label={statusLabel} tone={statusTone} />
            </div>

            <div className={cn("mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground", isMobile && "gap-x-3")}>
              <span>{getReminderSecondaryLine(notification, scope, formatDateTime)}</span>
              <span>{getReminderRepeatLabel(notification.repeat_rule)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
