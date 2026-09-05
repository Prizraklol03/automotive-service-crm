import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyThemeMode, getStoredThemeMode } from "@/shared/lib/theme";
import { useThemeStore } from "@/shared/model/theme-store";
import { VisualSettingsCard } from "@/features/settings/ui/visual-settings-card";

vi.mock("@/features/settings/api/settings-hooks", () => ({
  useUpdateVisualConfigMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVisualConfigQuery: () => ({
    data: { accent_hue: null, preset: null, status_colors: null, ui_density: null, working_month_start_day: 25 },
    isError: false,
    isLoading: false
  })
}));

describe("theme mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    applyThemeMode("dark");
    useThemeStore.setState({ mode: "dark" });
  });

  it("defaults to dark when nothing is stored", () => {
    expect(getStoredThemeMode()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies and persists light mode via the store", () => {
    useThemeStore.getState().setMode("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("crm.theme_mode")).toBe("light");
    expect(getStoredThemeMode()).toBe("light");
  });

  it("switches theme from the visual settings toggle without reload", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<VisualSettingsCard />);
    });

    const lightButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Светлая")
    );
    expect(lightButton).toBeTruthy();

    await act(async () => {
      lightButton?.click();
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("crm.theme_mode")).toBe("light");

    act(() => root.unmount());
    container.remove();
  });
});
