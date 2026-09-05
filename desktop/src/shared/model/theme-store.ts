import { create } from "zustand";

import { applyThemeMode, getStoredThemeMode, persistThemeMode, type ThemeMode } from "@/shared/lib/theme";

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  mode: getStoredThemeMode(),
  setMode: (mode) => {
    applyThemeMode(mode);
    persistThemeMode(mode);
    set({ mode });
  }
}));
