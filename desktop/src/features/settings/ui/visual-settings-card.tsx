import { useState } from "react";
import { Check, Loader2, Moon, Sun } from "lucide-react";

import { useUpdateVisualConfigMutation, useVisualConfigQuery } from "@/features/settings/api/settings-hooks";
import type { UIDensity, VisualConfig } from "@/entities/settings/model/types";
import type { ThemeMode } from "@/shared/lib/theme";
import { cn } from "@/shared/lib/cn";
import { useThemeStore } from "@/shared/model/theme-store";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";

// ── Color palette ─────────────────────────────────────────────────────────────

type ColorPreset = { label: string; hue: number | null };

const ACCENT_PRESETS: ColorPreset[] = [
  { label: "Зелёный", hue: 91 },
  { label: "Изумруд", hue: 158 },
  { label: "Бирюза", hue: 175 },
  { label: "Синий", hue: 210 },
  { label: "Фиолет", hue: 262 },
  { label: "Роза", hue: 330 },
  { label: "Красный", hue: 5 },
  { label: "Оранжевый", hue: 25 },
  { label: "Жёлтый", hue: 50 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function accentSwatchStyle(hue: number): React.CSSProperties {
  return { backgroundColor: `hsl(${hue} 55% 42%)` };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColorSwatch({
  style,
  label,
  isSelected,
  onClick
}: {
  style: React.CSSProperties;
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "relative h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none",
        isSelected && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
      )}
      style={style}
    >
      {isSelected && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-white drop-shadow" />
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Moon }> = [
  { mode: "dark", label: "Тёмная", Icon: Moon },
  { mode: "light", label: "Светлая", Icon: Sun }
];

export function VisualSettingsCard() {
  const visualQuery = useVisualConfigQuery();
  const updateMutation = useUpdateVisualConfigMutation();
  const themeMode = useThemeStore((state) => state.mode);
  const setThemeMode = useThemeStore((state) => state.setMode);

  const serverConfig = visualQuery.data;

  // Local draft state (mirrors server values until saved)
  const [draft, setDraft] = useState<VisualConfig | null>(null);

  // Merge server config with local draft
  const config: VisualConfig = draft ?? serverConfig ?? {
    accent_hue: null,
    status_colors: null,
    ui_density: null,
    preset: null,
    working_month_start_day: 25
  };

  function patch(partial: Partial<VisualConfig>) {
    const base =
      draft ?? serverConfig ?? { accent_hue: null, status_colors: null, ui_density: null, preset: null, working_month_start_day: 25 };
    setDraft({ ...base, ...partial });
  }

  async function handleSave() {
    if (!draft) return;
    await updateMutation.mutateAsync(draft);
    setDraft(null);
  }

  const isDirty = draft !== null;

  if (visualQuery.isLoading) {
    return (
      <div className="glass-panel flex items-center gap-3 rounded-2xl p-5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Загружаем настройки внешнего вида…</span>
      </div>
    );
  }

	  return (
	    <div className="glass-panel rounded-2xl p-5 sm:p-6">
	      <div className="mb-5 flex items-start justify-between gap-3">
	        <div>
	          <h2 className="text-base font-semibold">Внешний вид</h2>
	          <p className="mt-1 text-sm text-muted-foreground">Акцентный цвет CRM, плотность интерфейса и визуальное отображение уже настроенных статусов.</p>
	        </div>
        {isDirty && (
          <AppButton
            size="sm"
            onClick={() => void handleSave()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Сохранить
          </AppButton>
        )}
      </div>

	      <div className="space-y-6">
	        {/* ── Акцентный цвет ───────────────────────────────────────────── */}
	        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Тема оформления</p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ mode, label, Icon }) => {
              const isActive = themeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setThemeMode(mode)}
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-xl border px-4 py-3 text-left transition-colors sm:flex-none",
                    isActive
                      ? "border-accent bg-accent-muted text-foreground"
                      : "border-border/60 bg-surface-2/40 text-muted-foreground hover:border-border"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Применяется сразу и сохраняется на этом устройстве.</p>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Акцентный цвет</p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_PRESETS.map((preset) => (
              <ColorSwatch
                key={preset.hue}
                label={preset.label}
                style={accentSwatchStyle(preset.hue!)}
                isSelected={config.accent_hue === preset.hue || (preset.hue === 91 && config.accent_hue === null)}
                onClick={() => patch({ accent_hue: preset.hue === 91 ? null : preset.hue })}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Используется для кнопок, ссылок и активных элементов.
          </p>
        </div>

        {/* ── Плотность UI ─────────────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Плотность интерфейса</p>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as UIDensity[]).map((d) => {
              const isActive = (config.ui_density ?? "comfortable") === d;
              const labels = { comfortable: "Комфортный", compact: "Компактный" };
              const desc = { comfortable: "Просторно, удобно для тач", compact: "Плотнее, больше информации" };
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => patch({ ui_density: d === "comfortable" ? null : d })}
                  className={cn(
                    "flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors",
                    isActive
                      ? "border-accent bg-accent-muted text-foreground"
                      : "border-border/60 bg-surface-2/40 text-muted-foreground hover:border-border"
                  )}
                >
                  <span className="text-sm font-medium">{labels[d]}</span>
                  <span className="mt-0.5 text-xs opacity-70">{desc[d]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Рабочий месяц</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:items-end">
            <AppInput
              type="number"
              min={1}
              max={28}
              value={String(config.working_month_start_day)}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                patch({ working_month_start_day: Math.min(28, Math.max(1, Math.trunc(parsed))) });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Рабочий месяц считается от выбранного дня текущего месяца до дня перед ним в следующем месяце.
            </p>
          </div>
        </div>

      </div>

      {/* Error */}
      {updateMutation.isError && (
        <p className="mt-4 text-sm text-danger">
          {updateMutation.error?.message ?? "Не удалось сохранить настройки"}
        </p>
      )}
    </div>
  );
}
