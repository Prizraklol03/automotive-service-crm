import { useEffect } from "react";

import type { VisualConfig } from "@/entities/settings/model/types";
import type { ThemeMode } from "@/shared/lib/theme";

// Saturation and lightness levels for custom accent hue.
// --accent/--accent-hover/--ring are solid fills (buttons, rings) and read fine on either
// page background, so they stay constant across themes. --accent-muted is a translucent
// "selected" surface painted *under* theme-aware foreground text, so light theme needs a
// light tint instead of dark theme's dark tint, or the text becomes unreadable on top of it.
const ACCENT_S = "20%";
const ACCENT_BASE_L = "28%";
const ACCENT_HOVER_L = "35%";
const ACCENT_RING_L = "38%";
const ACCENT_MUTED_BY_THEME: Record<ThemeMode, { saturation: string; lightness: string }> = {
  dark: { saturation: "19%", lightness: "18%" },
  light: { saturation: "45%", lightness: "90%" }
};

// Default accent hue (green, matches the CSS default)
const DEFAULT_ACCENT_HUE = 91;
const STATUS_TEXT_COLOR = "hsl(0 0% 100%)";
const STATUS_NEUTRAL_BG = "hsl(220 9% 32%)";

// Per-status fallback hues used when status_colors is not configured in visual settings.
// Covers both canonical codes (post-0046) and legacy codes (pre-0046).
const LEGACY_STATUS_DEFAULT_HUES: Record<string, number | null> = {
  // Canonical codes (migration 0046+) — from migration 0046 hex colors
  new: null,               // #6b7280 (gray, neutral)
  in_progress: 221,        // #2563eb (blue)
  done: 160,               // #10b981 (green)
  closed: 175,             // #0f766e (teal)
  cancelled: 0,            // #ef4444 (red)
  // Legacy codes (pre-0046 installs) — preserved for backward compatibility
  draft: null,             // #6b7280 (gray, neutral)
  waiting: 38,             // #f59e0b (amber)
  postponed: 258,          // #8b5cf6 (violet)
  completed: 160,          // #10b981 (green)
};

function accentHueForStatusCode(code: string): number | null {
  return code in LEGACY_STATUS_DEFAULT_HUES ? (LEGACY_STATUS_DEFAULT_HUES[code] ?? null) : null;
}

function applyAccentHue(hue: number, themeMode: ThemeMode) {
  const root = document.documentElement;
  const muted = ACCENT_MUTED_BY_THEME[themeMode];
  root.style.setProperty("--accent", `${hue} ${ACCENT_S} ${ACCENT_BASE_L}`);
  root.style.setProperty("--accent-hover", `${hue} ${ACCENT_S} ${ACCENT_HOVER_L}`);
  root.style.setProperty("--accent-muted", `${hue} ${muted.saturation} ${muted.lightness}`);
  root.style.setProperty("--ring", `${hue} ${ACCENT_S} ${ACCENT_RING_L}`);
}

function resetAccentHue() {
  const root = document.documentElement;
  root.style.removeProperty("--accent");
  root.style.removeProperty("--accent-hover");
  root.style.removeProperty("--accent-muted");
  root.style.removeProperty("--ring");
}

/**
 * Apply status colors for all codes that appear in the custom colors map
 * or in the legacy fallback table.
 */
function applyStatusColors(
  colors: Record<string, number | null> | null,
  allCodes: string[]
) {
  const root = document.documentElement;

  // Apply for every known code
  const codes = allCodes.length > 0 ? allCodes : Object.keys(LEGACY_STATUS_DEFAULT_HUES);

  for (const code of codes) {
    const customHue = colors?.[code];
    const hue = customHue !== undefined ? customHue : accentHueForStatusCode(code);
    const cssKey = code.replace(/_/g, "-");

    if (hue === null) {
      root.style.setProperty(`--status-${cssKey}-bg`, STATUS_NEUTRAL_BG);
      root.style.setProperty(`--status-${cssKey}-text`, STATUS_TEXT_COLOR);
    } else {
      root.style.setProperty(`--status-${cssKey}-bg`, `hsl(${hue} 58% 42%)`);
      root.style.setProperty(`--status-${cssKey}-text`, STATUS_TEXT_COLOR);
    }
  }
}

function applyDensity(density: "comfortable" | "compact" | null) {
  const root = document.documentElement;
  if (density === "compact") {
    root.setAttribute("data-density", "compact");
  } else {
    root.removeAttribute("data-density");
  }
}

/**
 * Applies VisualConfig settings as CSS custom properties and HTML attributes.
 * Call once from the app root — it reads the config and patches the DOM.
 *
 * @param config      The visual config from the API
 * @param statusCodes All active status codes (from CrmOrderStatus[]) — used to apply CSS vars for dynamic statuses
 */
export function useVisualTheme(
  config: VisualConfig | null | undefined,
  statusCodes: string[] = [],
  themeMode: ThemeMode = "dark"
) {
  useEffect(() => {
    if (!config) {
      resetAccentHue();
      applyStatusColors(null, statusCodes);
      applyDensity(null);
      return;
    }

    if (config.accent_hue !== null && config.accent_hue !== undefined) {
      applyAccentHue(config.accent_hue, themeMode);
    } else {
      applyAccentHue(DEFAULT_ACCENT_HUE, themeMode);
      resetAccentHue();
    }

    applyStatusColors(config.status_colors, statusCodes);
    applyDensity(config.ui_density);
  }, [config, statusCodes, themeMode]);
}

/**
 * Returns the inline style for an order status badge based on current CSS vars.
 * Works for any status code — the CSS var is set by useVisualTheme.
 */
export function getOrderStatusBadgeStyle(statusCode: string): React.CSSProperties {
  const cssKey = statusCode.replace(/_/g, "-");
  return {
    backgroundColor: `var(--status-${cssKey}-bg, ${STATUS_NEUTRAL_BG})`,
    color: `var(--status-${cssKey}-text, ${STATUS_TEXT_COLOR})`
  };
}
