import { ShieldUser } from "lucide-react";

import type { User } from "@/entities/crm-user/model/types";
import { cn } from "@/shared/lib/cn";
import { StatusBadge } from "@/shared/ui/status-badge";

export function UsersList({
  users,
  onOpenUser,
  selectedUserId
}: {
  users: User[];
  onOpenUser: (userId: number) => void;
  selectedUserId: number | null;
}) {
  return (
    <div className="grid gap-3">
      {users.map((user) => {
        const isSelected = selectedUserId === user.id;

        return (
          <button
            key={user.id}
            type="button"
            onClick={() => onOpenUser(user.id)}
            className={cn(
              "glass-panel w-full rounded-2xl p-5 text-left transition-all hover:border-accent/50 hover:bg-surface-2",
              isSelected ? "border-accent/60 bg-accent-muted/40" : "border-border"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl bg-accent-muted p-2 text-foreground">
                    <ShieldUser className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-foreground">{user.full_name}</div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">@{user.login}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge label={user.is_active ? "Активно" : "В архиве"} tone={user.is_active ? "success" : "muted"} />
                  <StatusBadge label={user.role_code === "admin" ? "Администратор" : "Пользователь"} tone="muted" />
                </div>
              </div>
              <div className="text-sm text-muted-foreground">#{user.id}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
