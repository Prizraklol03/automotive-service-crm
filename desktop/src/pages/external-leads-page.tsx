import { useDeferredValue, useMemo, useState } from "react";
import { Radio, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { ExternalLeadListItem, ExternalLeadStatus } from "@/entities/external-lead/model/types";
import { ExternalLeadDetailPanel } from "@/features/external-leads/ui/external-leads-detail-panel";
import { useExternalLeadsListQuery, useExternalLeadSummaryQuery } from "@/features/external-leads/api/external-leads-hooks";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { cn } from "@/shared/lib/cn";
import { formatDateTime, formatNumber } from "@/shared/lib/format";
import { formatPhoneDisplay } from "@/shared/lib/phone";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingState } from "@/shared/ui/loading-state";
import { PageContainer } from "@/shared/ui/page-container";
import { PageHeader } from "@/shared/ui/page-header";
import { StatusBadge } from "@/shared/ui/status-badge";
import { StatCard } from "@/shared/ui/stat-card";

const FILTERS: Array<{ label: string; status: ExternalLeadStatus | null }> = [
  { status: "new", label: "Новые" },
  { status: "in_work", label: "В работе" },
  { status: "closed", label: "Закрытые" },
  { status: "spam", label: "Спам" },
  { status: null, label: "Все" }
];

function normalizeStatus(value: string | null): ExternalLeadStatus | null {
  if (value === "all") {
    return null;
  }
  if (value === "new" || value === "in_work" || value === "closed" || value === "spam") {
    return value;
  }
  return "new";
}

function matchesLeadSearch(lead: ExternalLeadListItem, search: string) {
  const normalizedQuery = search.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    lead.id,
    lead.display_name,
    lead.customer_phone_raw,
    lead.phone_normalized,
    lead.source_name,
    lead.form_name,
    lead.page_url,
    lead.package_name,
    lead.service_name,
    lead.message
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");

  return haystack.includes(normalizedQuery);
}

function getStatusLabel(status: ExternalLeadStatus) {
  switch (status) {
    case "in_work":
      return "В работе";
    case "closed":
      return "Закрыта";
    case "spam":
      return "Спам";
    case "new":
    default:
      return "Новая";
  }
}

function getStatusTone(status: ExternalLeadStatus): "accent" | "danger" | "muted" | "success" | "warning" {
  switch (status) {
    case "in_work":
      return "accent";
    case "closed":
      return "success";
    case "spam":
      return "danger";
    case "new":
    default:
      return "warning";
  }
}

export function ExternalLeadsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const deferredSearch = useDeferredValue(searchValue);
  const selectedLeadKey = searchParams.get("lead");
  const selectedStatus = normalizeStatus(searchParams.get("status"));

  const summaryQuery = useExternalLeadSummaryQuery();
  const leadsQuery = useExternalLeadsListQuery({ search: deferredSearch, status: selectedStatus });
  const leads = useMemo(
    () => (leadsQuery.data ?? []).filter((lead) => matchesLeadSearch(lead, deferredSearch)),
    [deferredSearch, leadsQuery.data]
  );

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    setSearchParams(next, { replace: true });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Внешние заявки"
        description="Менеджерский inbox по заявкам с сайтов, лендингов и форм обратного звонка."
      />

      <div className="hidden gap-4 md:grid-cols-3 lg:grid">
        <StatCard
          label="Новые"
          value={summaryQuery.data ? formatNumber(summaryQuery.data.newCount) : summaryQuery.isError ? "—" : "…"}
          hint="Требуют первого контакта"
          trend={<Radio className="h-4 w-4 text-warning" />}
        />
        <StatCard
          label="В работе"
          value={summaryQuery.data ? formatNumber(summaryQuery.data.inWorkCount) : summaryQuery.isError ? "—" : "…"}
          hint="Менеджер уже обрабатывает"
          trend={<Radio className="h-4 w-4 text-accent" />}
        />
        <StatCard
          label="Открытые"
          value={summaryQuery.data ? formatNumber(summaryQuery.data.totalOpenCount) : summaryQuery.isError ? "—" : "…"}
          hint="Общий активный inbox"
          trend={<Radio className="h-4 w-4 text-foreground" />}
        />
      </div>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Очередь заявок</h2>
            <p className="mt-1 text-sm text-muted-foreground">По умолчанию показываем новые заявки, чтобы они не терялись в общем потоке.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <AppButton
                key={filter.label}
                variant={selectedStatus === filter.status ? "default" : "outline"}
                onClick={() =>
                  updateParams({
                    lead: null,
                    status: filter.status ?? "all"
                  })
                }
              >
                {filter.label}
              </AppButton>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-4 max-w-[560px]">
          <div className="relative overflow-hidden rounded-lg border border-border/70 bg-gradient-to-b from-surface-2 to-surface p-0.5 shadow-soft">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
            <div className="relative flex items-center gap-2 rounded-md border border-border bg-background/40 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <AppInput
                type="search"
                value={searchValue}
                onChange={(event) => {
                  const next = event.target.value;
                  setSearchValue(next);
                  updateParams({ search: next.trim() ? next : null });
                }}
                placeholder="Поиск по клиенту, телефону, форме, пакету или сообщению"
                className="h-11 border-0 bg-transparent px-0 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:ring-0 sm:text-[13px]"
              />
            </div>
          </div>
        </div>

        {leadsQuery.isLoading ? (
          <LoadingState title="Загружаем заявки" description="Собираем входящие обращения из external leads inbox." />
        ) : null}

        {leadsQuery.isError ? (
          <ErrorState
            title="Не удалось загрузить заявки"
            description="Проверьте соединение и попробуйте снова."
            actionLabel="Повторить"
            onAction={() => void leadsQuery.refetch()}
          />
        ) : null}

        {!leadsQuery.isLoading && !leadsQuery.isError ? (
          leads.length ? (
            <div className="space-y-3">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => updateParams({ lead: String(lead.id) })}
                  className={cn(
                    "glass-panel w-full rounded-2xl px-4 py-4 text-left transition-colors hover:bg-surface-2/60",
                    lead.status === "new" && "border-warning/35 bg-warning/5"
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold">{lead.display_name}</div>
                        <StatusBadge label={getStatusLabel(lead.status)} tone={getStatusTone(lead.status)} />
                        {lead.duplicate_count > 0 ? <StatusBadge label={`Повторы ${lead.duplicate_count}`} tone="warning" /> : null}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatPhoneDisplay(lead.phone_normalized) ?? lead.customer_phone_raw}
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                        <LeadMeta label="Источник" value={lead.source_name || lead.integration_source_name || "Не указан"} />
                        <LeadMeta label="Форма" value={lead.form_name || "Не указана"} />
                        <LeadMeta label="Страница" value={lead.page_url || "Не указана"} />
                        <LeadMeta label="Пакет" value={lead.package_name || "—"} />
                        <LeadMeta label="Услуга" value={lead.service_name || "—"} />
                        <LeadMeta label="Создана" value={formatDateTime(lead.created_at)} />
                      </div>
                      {lead.message ? <div className="mt-3 line-clamp-3 text-sm text-foreground/90">{lead.message}</div> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Заявок по этому фильтру нет"
              description="Когда сайт отправит новую заявку, она появится здесь и в индикаторе верхней панели."
            />
          )
        ) : null}
      </section>

      <ExternalLeadDetailPanel isMobile={isMobile} leadKey={selectedLeadKey} onClose={() => updateParams({ lead: null })} />
    </PageContainer>
  );
}

function LeadMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="truncate">
      <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}: </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
