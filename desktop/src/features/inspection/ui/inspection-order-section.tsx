import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Camera, FileCheck2, FileText, Loader2, Lock, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  useConfirmInspectionSessionMutation,
  useCurrentInspectionSessionQuery,
  useGenerateInspectionActMutation,
  useLockInspectionSessionMutation,
  useReopenInspectionSessionMutation,
  useStartInspectionSessionMutation,
} from "@/features/inspection/api/inspection-hooks";
import { INSPECTION_STATUS_LABELS } from "@/features/inspection/model/types";
import { InspectionEditor } from "@/features/inspection/ui/inspection-editor";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/format";
import { AppButton } from "@/shared/ui/app-button";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useScopedBooleanPreference } from "@/shared/hooks/use-scoped-boolean-preference";

function statusTone(status: string) {
  if (status === "completed" || status === "confirmed") return "success" as const;
  if (status === "locked") return "muted" as const;
  if (status === "in_progress") return "accent" as const;
  return "warning" as const;
}

export function InspectionOrderSection({
  isMobile,
  isModernDesktop,
  orderId,
  orderLabel,
  sectionClassName,
  vehicleLabel,
}: {
  isMobile: boolean;
  isModernDesktop: boolean;
  orderId: number;
  orderLabel: string;
  sectionClassName: string;
  vehicleLabel: string;
}) {
  const navigate = useNavigate();
  const roleCode = useAuthStore((state) => state.user?.role_code);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const { value: isExpanded, setValue: setIsExpanded } = useScopedBooleanPreference("crm.pref.orderInspectionExpanded", false);
  const sessionQuery = useCurrentInspectionSessionQuery(orderId, isExpanded);
  const startMutation = useStartInspectionSessionMutation(orderId);
  const session = sessionQuery.data;
  const generateActMutation = useGenerateInspectionActMutation(orderId, session?.id ?? 0);
  const confirmMutation = useConfirmInspectionSessionMutation(orderId, session?.id ?? 0);
  const lockMutation = useLockInspectionSessionMutation(orderId, session?.id ?? 0);
  const reopenMutation = useReopenInspectionSessionMutation(orderId, session?.id ?? 0);

  const summaryRows = useMemo(
    () =>
      session
        ? [
            { label: "Статус", value: INSPECTION_STATUS_LABELS[session.status] },
            { label: "Начат", value: formatDateTime(session.started_at) ?? "—" },
            { label: "Завершён", value: formatDateTime(session.completed_at) ?? "—" },
            { label: "Отметки", value: String(session.marks_count) },
            { label: "Фото", value: String(session.mark_photos_count + session.general_photos_count) },
          ]
        : [],
    [session],
  );

  const handleStart = async () => {
    await startMutation.mutateAsync();
    setIsEditorOpen(true);
  };

  return (
    <>
      <section className={sectionClassName}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Осмотр автомобиля</h3>
          </div>
          <AppButton
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Свернуть осмотр" : "Развернуть осмотр"}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </AppButton>
        </div>

        {isExpanded ? (
          <div
          className={cn(
            "mt-4 rounded-2xl border border-border/80 p-4",
            isModernDesktop ? "bg-surface-3/60" : "bg-surface-2/50",
          )}
        >
          {sessionQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем данные осмотра...
            </div>
          ) : session ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Текущий осмотр заказа</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Последнее обновление: {formatDateTime(session.updated_at) ?? "—"}
                    {session.updated_by?.full_name ? ` · ${session.updated_by.full_name}` : ""}
                  </div>
                </div>
                <StatusBadge label={INSPECTION_STATUS_LABELS[session.status]} tone={statusTone(session.status)} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {summaryRows.map((row) => (
                  <div key={row.label} className="rounded-xl border border-border/70 bg-background/60 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{row.label}</div>
                    <div className="mt-2 text-sm font-medium">{row.value}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <AppButton onClick={() => setIsEditorOpen(true)} size="sm">
                  <Play className="h-4 w-4" />
                  {session.status === "draft" || session.status === "in_progress" ? "Продолжить" : "Открыть"}
                </AppButton>

                <AppButton
                  disabled={generateActMutation.isPending || !["completed", "confirmed", "locked"].includes(session.status)}
                  onClick={() => void generateActMutation.mutateAsync()}
                  size="sm"
                  variant="outline"
                >
                  {generateActMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                  Сформировать акт
                </AppButton>

                {session.latest_export?.document_id ? (
                  <AppButton
                    onClick={() => navigate(`/documents?order=${orderId}&document=${session.latest_export?.document_id}`)}
                    size="sm"
                    variant="outline"
                  >
                  <FileText className="h-4 w-4" />
                  Открыть акт
                </AppButton>
              ) : null}

                {session.status === "completed" ? (
                  <AppButton
                    disabled={confirmMutation.isPending}
                    onClick={() => void confirmMutation.mutateAsync()}
                    size="sm"
                    variant="outline"
                  >
                    {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Подтвердить
                  </AppButton>
                ) : null}

                {["completed", "confirmed"].includes(session.status) ? (
                  <AppButton
                    disabled={lockMutation.isPending}
                    onClick={() => void lockMutation.mutateAsync()}
                    size="sm"
                    variant="outline"
                  >
                    {lockMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Заблокировать
                  </AppButton>
                ) : null}

                {roleCode === "admin" && ["completed", "confirmed", "locked"].includes(session.status) ? (
                  <AppButton disabled={reopenMutation.isPending} onClick={() => void reopenMutation.mutateAsync()} size="sm" variant="ghost">
                    {reopenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Переоткрыть
                  </AppButton>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium">Осмотр ещё не начат</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Отметьте дефекты на схеме автомобиля, добавьте фото и сформируйте акт осмотра из snapshot-данных.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <AppButton disabled={startMutation.isPending} onClick={() => void handleStart()} size="sm">
                  {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Начать осмотр
                </AppButton>
              </div>
            </div>
          )}
        </div>
        ) : null}
      </section>

      <InspectionEditor
        isMobile={isMobile}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        orderId={orderId}
        orderLabel={orderLabel}
        vehicleLabel={vehicleLabel}
      />
    </>
  );
}
