import { ChevronRight } from "lucide-react";

import type { Client } from "@/entities/client/model/types";
import { getClientDisplayLabel } from "@/entities/client/model/types";
import type { ListViewMode } from "@/shared/hooks/use-persisted-view-mode";
import { cn } from "@/shared/lib/cn";
import { formatPhoneDisplay } from "@/shared/lib/phone";
import { formatTelegramUsername } from "@/shared/lib/telegram";
import { EmptyState } from "@/shared/ui/empty-state";

export function ClientsList({
  clients,
  isMobile,
  onOpenClient,
  selectedClientId,
  viewMode = "rows"
}: {
  clients: Client[];
  isMobile: boolean;
  onOpenClient: (clientId: number) => void;
  selectedClientId: number | null;
  viewMode?: ListViewMode;
}) {
  if (!clients.length) {
    return <EmptyState title="Клиенты не найдены" description="Измените строку поиска или создайте нового клиента." />;
  }

  const renderClientCard = (client: Client) => {
    const displayLabel = getClientDisplayLabel(client);
    const phoneDisplay = formatPhoneDisplay(client.phone_display) ?? client.phone_display;
    const telegramUsername = formatTelegramUsername(client.telegram_username);

    return (
      <button
        key={client.id}
        type="button"
        onClick={() => onOpenClient(client.id)}
        className={cn(
          "glass-panel w-full cursor-pointer rounded-2xl p-4 text-left transition-colors hover:bg-surface-2/80",
          selectedClientId === client.id && "border-accent/60"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">{displayLabel}</div>
            <div className="mt-2 text-sm text-muted-foreground">{phoneDisplay}</div>
            {telegramUsername ? <div className="mt-1 text-xs text-muted-foreground">{telegramUsername}</div> : null}
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        {client.comment?.trim() ? <div className="mt-3 line-clamp-2 text-sm text-muted-foreground">{client.comment.trim()}</div> : null}
      </button>
    );
  };

  if (isMobile || viewMode === "cards") {
    return <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{clients.map(renderClientCard)}</div>;
  }

  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[minmax(0,1.5fr)_220px_180px_36px] gap-4 border-b border-border bg-surface-2/70 px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Клиент</span>
        <span>Телефон</span>
        <span>Telegram</span>
        <span />
      </div>
      <div className="divide-y divide-border">
        {clients.map((client) => {
          const displayLabel = getClientDisplayLabel(client);
          const phoneDisplay = formatPhoneDisplay(client.phone_display) ?? client.phone_display;
          const telegramUsername = formatTelegramUsername(client.telegram_username);

          return (
            <button
              key={client.id}
              type="button"
              onClick={() => onOpenClient(client.id)}
              className={cn(
                "grid w-full cursor-pointer grid-cols-[minmax(0,1.5fr)_220px_180px_36px] items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2/50",
                selectedClientId === client.id && "bg-accent-muted/60"
              )}
            >
              <div className="min-w-0">
                <div className="font-medium">{displayLabel}</div>
                {client.comment?.trim() ? <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{client.comment.trim()}</div> : null}
              </div>
              <div className="text-sm text-muted-foreground">{phoneDisplay}</div>
              <div className="text-sm text-muted-foreground">{telegramUsername ?? "—"}</div>
              <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
