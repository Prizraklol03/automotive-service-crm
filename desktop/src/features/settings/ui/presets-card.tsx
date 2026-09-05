import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  useApplyPresetMutation,
  usePresetsQuery,
} from "@/features/settings/api/settings-hooks";
import type { StatusPreset } from "@/entities/settings/model/types";
import { STATUS_GROUP_LABELS } from "@/entities/settings/model/types";
import { AppButton } from "@/shared/ui/app-button";
import { SectionCard } from "@/shared/ui/section-card";

function PresetCard({
  preset,
  onApply,
  isApplying,
}: {
  preset: StatusPreset;
  onApply: () => void;
  isApplying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

	  return (
	    <div className="rounded-2xl border border-border/70 bg-surface-2/40 p-4">
	      <div className="flex items-start justify-between gap-3">
	        <div className="min-w-0 flex-1">
	          <div className="text-sm font-semibold text-foreground">{preset.label}</div>
	          <div className="mt-0.5 text-xs text-muted-foreground">{preset.description}</div>
	          <div className="mt-3 flex flex-wrap gap-2">
	            <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground">
	              Статусов: <span className="font-medium text-foreground">{preset.statuses.length}</span>
	            </span>
	            <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground">
	              Этапов: <span className="font-medium text-foreground">{new Set(preset.statuses.map((s) => s.status_group)).size}</span>
	            </span>
	          </div>
	        </div>
        <AppButton
          type="button"
          size="sm"
          variant="outline"
          disabled={isApplying}
          onClick={onApply}
        >
          {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Применить
        </AppButton>
      </div>

	      <button
	        type="button"
	        className="mt-3 text-xs font-medium text-accent hover:underline"
	        onClick={() => setExpanded((v) => !v)}
	      >
        {expanded ? "Скрыть статусы" : `Посмотреть статусы (${preset.statuses.length})`}
      </button>

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {preset.statuses.map((s) => (
            <span
              key={s.sort_order}
              className="flex items-center gap-1 rounded-full border border-border/60 bg-surface-2 px-2 py-0.5 text-xs text-foreground"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.display_name}
              <span className="text-muted-foreground">
                · {STATUS_GROUP_LABELS[s.status_group]}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PresetsCard() {
  const presetsQuery = usePresetsQuery();
  const applyMutation = useApplyPresetMutation();
  const [applyingName, setApplyingName] = useState<string | null>(null);

  const handleApply = (name: string, label: string) => {
    if (
      !window.confirm(
        `Применить пресет «${label}»?\n\nВсе текущие статусы будут заменены, а заказы переведены в ближайший подходящий статус нового пресета. Действие необратимо.`
      )
    )
      return;

    setApplyingName(name);
    applyMutation.mutate(name, {
      onSettled: () => setApplyingName(null),
    });
  };

	  return (
	    <SectionCard
	      title="Пресеты статусов"
	      description="Шаг 1: выберите базовую схему статусов под свой бизнес. После применения можно донастроить названия, порядок и цвета в блоке «Статусы заказов»."
	    >

      {presetsQuery.isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем пресеты...
        </div>
      )}

      {applyMutation.isError && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {applyMutation.error?.message ?? "Не удалось применить пресет"}
        </div>
      )}

      {presetsQuery.data && (
        <div className="space-y-3">
          {presetsQuery.data.map((preset) => (
            <PresetCard
              key={preset.name}
              preset={preset}
              onApply={() => handleApply(preset.name, preset.label)}
              isApplying={applyingName === preset.name && applyMutation.isPending}
            />
          ))}
        </div>
      )}
	    </SectionCard>
	  );
	}
