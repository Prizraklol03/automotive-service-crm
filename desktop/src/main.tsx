import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/app/App";
import "@/app/styles/globals.css";
import { applyThemeMode, getStoredThemeMode } from "@/shared/lib/theme";
import { installStaleBuildRecovery } from "@/shared/lib/stale-build-recovery";

applyThemeMode(getStoredThemeMode());

if (import.meta.env.PROD) {
  installStaleBuildRecovery();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
