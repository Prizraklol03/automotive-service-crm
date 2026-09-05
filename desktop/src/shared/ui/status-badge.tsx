import { cva } from "class-variance-authority";

import { cn } from "@/shared/lib/cn";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", {
  defaultVariants: {
    tone: "muted"
  },
  variants: {
    tone: {
      accent: "bg-accent-muted text-foreground",
      danger: "bg-danger/15 text-danger",
      muted: "bg-surface-2 text-muted-foreground",
      success: "bg-success/15 text-success",
      warning: "bg-warning/15 text-warning"
    }
  }
});

type StatusTone = "accent" | "danger" | "muted" | "success" | "warning";

const toneMap: Record<string, StatusTone> = {
  active: "accent",
  admin: "accent",
  archived: "muted",
  cancelled: "danger",
  closed: "success",
  done: "success",
  expired: "warning",
  standard_user: "warning",
  in_progress: "accent",
  new: "muted",
  offline: "danger",
  "Активно": "accent",
  "Архив": "muted",
  "В работе": "accent",
  "Выдан": "success",
  "Готово": "success",
  "Запланировано": "muted",
  "К исполнению": "warning",
  "Неактивно": "muted",
  "Новый": "muted",
  "Отменён": "danger",
  "Удалено": "danger"
};

export function StatusBadge({ className, label, tone }: { className?: string; label: string; tone?: StatusTone }) {
  const resolvedTone = tone ?? toneMap[label] ?? "muted";
  return <span className={cn(badgeVariants({ tone: resolvedTone }), className)}>{label}</span>;
}
