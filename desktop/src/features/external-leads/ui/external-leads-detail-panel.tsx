import { useMemo } from "react";
import { ExternalLink, MessageSquareText, Tags, X } from "lucide-react";

import type { ExternalLeadStatus } from "@/entities/external-lead/model/types";
import { useExternalLeadDetailQuery, useUpdateExternalLeadStatusMutation } from "@/features/external-leads/api/external-leads-hooks";
import { useOverlayMode } from "@/shared/hooks/use-overlay-mode";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { formatPhoneDisplay } from "@/shared/lib/phone";
import { AppButton } from "@/shared/ui/app-button";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { MobileSheet } from "@/shared/ui/mobile-sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

const STATUS_OPTIONS: Array<{ label: string; status: ExternalLeadStatus; tone: "accent" | "danger" | "muted" | "success" | "warning" }> = [
  { status: "new", label: "Новая", tone: "warning" },
  { status: "in_work", label: "В работе", tone: "accent" },
  { status: "closed", label: "Закрыта", tone: "success" },
  { status: "spam", label: "Спам", tone: "danger" }
];

function getStatusMeta(status: ExternalLeadStatus) {
  return STATUS_OPTIONS.find((item) => item.status === status) ?? STATUS_OPTIONS[0];
}

export function ExternalLeadDetailPanel({
  isMobile,
  leadKey,
  onClose
}: {
  isMobile: boolean;
  leadKey: string | null;
  onClose: () => void;
}) {
  useOverlayMode(Boolean(leadKey), onClose);
  const leadId = leadKey ? Number(leadKey) : null;
  const detailQuery = useExternalLeadDetailQuery(Number.isFinite(leadId) ? leadId : null);
  const updateMutation = useUpdateExternalLeadStatusMutation();

  const content = useMemo(() => {
    if (detailQuery.isLoading) {
      return <LoadingState title="Загружаем заявку" description="Подготавливаем карточку заявки для менеджера." />;
    }

    if (detailQuery.isError || !detailQuery.data) {
      return (
        <ErrorState
          title="Не удалось открыть заявку"
          description="Попробуйте открыть карточку ещё раз."
          actionLabel="Повторить"
          onAction={() => void detailQuery.refetch()}
        />
      );
    }

    const lead = detailQuery.data;
    const statusMeta = getStatusMeta(lead.status);
    const phone = formatPhoneDisplay(lead.phone_normalized) ?? lead.customer_phone_raw;

    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-border/70 bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">External Lead</div>
              <h3 className="mt-2 text-xl font-semibold">{lead.display_name}</h3>
              <div className="mt-2 text-sm text-muted-foreground">{phone}</div>
            </div>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Источник" value={lead.source_name || lead.integration_source_name || "Не указан"} />
            <Info label="Форма" value={lead.form_name || "Не указана"} />
            <Info label="Блок" value={lead.source_block || "Не указан"} />
            <Info label="Создана" value={formatDateTime(lead.created_at)} />
          </div>
          {lead.page_url ? (
            <a
              className="mt-4 inline-flex items-center gap-2 text-sm text-accent transition-colors hover:text-foreground"
              href={lead.page_url}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              Открыть страницу источника
            </a>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border/70 bg-surface p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareText className="h-4 w-4 text-warning" />
            Запрос клиента
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            <Info label="Пакет" value={lead.package_name || "Не указан"} />
            <Info label="Услуга" value={lead.service_name || "Не указана"} />
            <Info label="Сообщение" value={lead.message || "Пусто"} />
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-surface p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Tags className="h-4 w-4 text-warning" />
            UTM и метаданные
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="utm_source" value={lead.utm_source || "—"} />
            <Info label="utm_medium" value={lead.utm_medium || "—"} />
            <Info label="utm_campaign" value={lead.utm_campaign || "—"} />
            <Info label="utm_content" value={lead.utm_content || "—"} />
            <Info label="utm_term" value={lead.utm_term || "—"} />
            <Info label="Повторы" value={String(lead.duplicate_count)} />
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-surface p-4">
          <div className="text-sm font-semibold">Статус заявки</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <AppButton
                key={option.status}
                variant={lead.status === option.status ? "default" : "outline"}
                disabled={updateMutation.isPending}
                onClick={() => void updateMutation.mutateAsync({ leadId: lead.id, status: option.status })}
              >
                {option.label}
              </AppButton>
            ))}
          </div>
          {updateMutation.isError ? (
            <p className="mt-3 text-sm text-danger">{updateMutation.error.message}</p>
          ) : null}
        </section>
      </div>
    );
  }, [detailQuery, updateMutation]);

  if (!leadKey) {
    return null;
  }

  const panel = (
    <aside
      className={cn(
        "z-50 flex flex-col overflow-hidden bg-background shadow-panel",
        isMobile
          ? "fixed inset-0 h-svh w-full"
          : "fixed left-1/2 top-1/2 hidden max-h-[min(820px,calc(100svh-2rem))] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/80 lg:flex"
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Заявки</p>
          <h2 className="mt-1 text-lg font-semibold">Карточка внешней заявки</h2>
        </div>
        <AppButton size="icon" variant="ghost" onClick={onClose} aria-label="Закрыть заявку">
          <X className="h-4 w-4" />
        </AppButton>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">{content}</div>
    </aside>
  );

  if (isMobile) {
    return (
      <MobileSheet closeOnBackdropClick={false} onClose={onClose}>
        {panel}
      </MobileSheet>
    );
  }

  return <div className="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm lg:block">{panel}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-sm text-foreground">{value}</div>
    </div>
  );
}
